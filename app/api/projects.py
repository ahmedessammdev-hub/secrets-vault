from fastapi import APIRouter, HTTPException, Depends, Header
from typing import Optional
from app.models import ProjectPayload, EnvExportRequest
from app.projects_service import ProjectsService
from app.vault_service import VaultService

router = APIRouter(prefix="/projects", tags=["Projects"])

projects_service: Optional[ProjectsService] = None
vault_service: Optional[VaultService] = None


def get_projects() -> ProjectsService:
    if projects_service is None:
        raise HTTPException(status_code=500, detail="Projects service uninitialized")
    return projects_service


def get_vault() -> VaultService:
    if vault_service is None:
        raise HTTPException(status_code=500, detail="Vault service uninitialized")
    return vault_service


@router.get("")
def list_projects(service: ProjectsService = Depends(get_projects)):
    return service.list_projects()


@router.post("")
def create_project(payload: ProjectPayload, service: ProjectsService = Depends(get_projects)):
    return service.create_project(payload)


@router.get("/{project_id}")
def get_project(project_id: str, service: ProjectsService = Depends(get_projects)):
    try:
        return service.get_project(project_id)
    except KeyError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.put("/{project_id}")
def update_project(project_id: str, payload: ProjectPayload, service: ProjectsService = Depends(get_projects)):
    try:
        return service.update_project(project_id, payload)
    except KeyError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.delete("/{project_id}")
def delete_project(project_id: str, service: ProjectsService = Depends(get_projects)):
    service.delete_project(project_id)
    return {"success": True, "message": "Project deleted"}


@router.get("/{project_id}/env")
def export_env(
    project_id: str,
    env: str = "production",
    service: ProjectsService = Depends(get_projects),
):
    try:
        return service.export_env(project_id, env_name=env)
    except KeyError:
        raise HTTPException(status_code=404, detail="Project not found")


@router.post("/{project_id}/env-write")
def write_env_file(
    project_id: str,
    req: EnvExportRequest,
    service: ProjectsService = Depends(get_projects),
    vault: VaultService = Depends(get_vault),
    x_reauth_token: Optional[str] = Header(None),
):
    if not vault.verify_reauth_token(x_reauth_token):
        raise HTTPException(status_code=428, detail="Re-authentication required to write plaintext secrets to disk")

    try:
        return service.export_env(project_id, env_name=req.environment, write_to_path=req.write_to_path)
    except KeyError:
        raise HTTPException(status_code=404, detail="Project not found")
