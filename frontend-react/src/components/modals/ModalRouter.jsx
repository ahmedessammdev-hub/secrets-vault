import React from "react";
import { useVault } from "../../context/VaultContext";
import { ItemEditModal } from "./ItemEditModal";
import { GeneratorModal } from "./GeneratorModal";
import { CommandPalette } from "./CommandPalette";
import { ImportModal } from "./ImportModal";
import { SecurityDashboardModal } from "./SecurityDashboardModal";
import { SettingsModal } from "./SettingsModal";
import { FieldHistoryModal } from "./FieldHistoryModal";
import { QrCodeModal } from "./QrCodeModal";
import { EnvExportModal } from "./EnvExportModal";
import { AddProjectModal } from "./AddProjectModal";
import { AddCategoryModal } from "./AddCategoryModal";
import { ReauthModal } from "./ReauthModal";

export function ModalRouter() {
  const { activeModal, closeModal } = useVault();

  if (!activeModal) return null;

  switch (activeModal.type) {
    case "itemEdit":
      return <ItemEditModal item={activeModal.props?.item} onClose={closeModal} />;
    case "generator":
      return <GeneratorModal onSelect={activeModal.props?.onSelect} onClose={closeModal} />;
    case "palette":
      return <CommandPalette onClose={closeModal} />;
    case "import":
      return <ImportModal initialTab={activeModal.props?.initialTab} onClose={closeModal} />;
    case "security":
      return <SecurityDashboardModal onClose={closeModal} />;
    case "settings":
      return <SettingsModal initialTab={activeModal.props?.initialTab} onClose={closeModal} />;
    case "history":
      return (
        <FieldHistoryModal
          itemId={activeModal.props?.itemId}
          fieldId={activeModal.props?.fieldId}
          label={activeModal.props?.label}
          onClose={closeModal}
        />
      );
    case "qr":
      return (
        <QrCodeModal
          itemId={activeModal.props?.itemId}
          fieldId={activeModal.props?.fieldId}
          label={activeModal.props?.label}
          onClose={closeModal}
        />
      );
    case "envExport":
      return <EnvExportModal projectId={activeModal.props?.projectId} onClose={closeModal} />;
    case "addProject":
      return <AddProjectModal onClose={closeModal} />;
    case "addCategory":
      return <AddCategoryModal onClose={closeModal} />;
    case "reauth":
      return <ReauthModal resolve={activeModal.props?.resolve} onClose={closeModal} />;
    default:
      return null;
  }
}
