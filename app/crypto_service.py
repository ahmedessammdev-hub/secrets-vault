import secrets
import json
from typing import Dict, Any, Tuple
from argon2.low_level import hash_secret_raw, Type
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag

DEFAULT_KDF_PARAMS: Dict[str, Any] = {
    "algorithm": "argon2id",
    "memory_cost": 65536,  # 64 MiB
    "time_cost": 3,
    "parallelism": 4,
    "hash_len": 32,
}

VERIFIER_PLAINTEXT = b"secrets-vault-verifier"
VERIFIER_AAD = b"verifier"
VAULT_KEY_AAD = b"vault_key|v2"


class CryptoError(Exception):
    """Base exception for cryptographic operations."""
    pass


class IntegrityError(CryptoError):
    """Raised when authentication tag or integrity check fails."""
    pass


class CryptoService:
    @staticmethod
    def generate_salt(length: int = 16) -> bytes:
        return secrets.token_bytes(length)

    @staticmethod
    def generate_vault_key(length: int = 32) -> bytes:
        return secrets.token_bytes(length)

    @staticmethod
    def derive_kek(master_password: str, salt: bytes, kdf_params: Dict[str, Any] = None) -> bytes:
        if kdf_params is None:
            kdf_params = DEFAULT_KDF_PARAMS
        try:
            kek = hash_secret_raw(
                secret=master_password.encode("utf-8"),
                salt=salt,
                time_cost=kdf_params.get("time_cost", 3),
                memory_cost=kdf_params.get("memory_cost", 65536),
                parallelism=kdf_params.get("parallelism", 4),
                hash_len=kdf_params.get("hash_len", 32),
                type=Type.ID,
            )
            return kek
        except Exception as e:
            raise CryptoError(f"KDF derivation failed: {str(e)}") from e

    @staticmethod
    def wrap_vault_key(kek: bytes, vault_key: bytes) -> bytes:
        nonce = secrets.token_bytes(12)
        aesgcm = AESGCM(kek)
        ciphertext_and_tag = aesgcm.encrypt(nonce, vault_key, VAULT_KEY_AAD)
        return nonce + ciphertext_and_tag

    @staticmethod
    def unwrap_vault_key(kek: bytes, wrapped_vault_key: bytes) -> bytes:
        if len(wrapped_vault_key) < 28:
            raise IntegrityError("Invalid wrapped key format: too short")
        nonce = wrapped_vault_key[:12]
        ciphertext_and_tag = wrapped_vault_key[12:]
        aesgcm = AESGCM(kek)
        try:
            return aesgcm.decrypt(nonce, ciphertext_and_tag, VAULT_KEY_AAD)
        except InvalidTag as e:
            raise IntegrityError("Failed to unwrap vault key: invalid tag") from e

    @staticmethod
    def create_verifier(vault_key: bytes) -> bytes:
        nonce = secrets.token_bytes(12)
        aesgcm = AESGCM(vault_key)
        ciphertext_and_tag = aesgcm.encrypt(nonce, VERIFIER_PLAINTEXT, VERIFIER_AAD)
        return nonce + ciphertext_and_tag

    @staticmethod
    def check_verifier(vault_key: bytes, verifier_blob: bytes) -> bool:
        if len(verifier_blob) < 28:
            return False
        nonce = verifier_blob[:12]
        ciphertext_and_tag = verifier_blob[12:]
        aesgcm = AESGCM(vault_key)
        try:
            decrypted = aesgcm.decrypt(nonce, ciphertext_and_tag, VERIFIER_AAD)
            return secrets.compare_digest(decrypted, VERIFIER_PLAINTEXT)
        except Exception:
            return False

    @staticmethod
    def encrypt_payload(vault_key: bytes, plaintext: bytes, aad: bytes) -> bytes:
        nonce = secrets.token_bytes(12)
        aesgcm = AESGCM(vault_key)
        ciphertext_and_tag = aesgcm.encrypt(nonce, plaintext, aad)
        return nonce + ciphertext_and_tag

    @staticmethod
    def decrypt_payload(vault_key: bytes, blob: bytes, aad: bytes) -> bytes:
        if len(blob) < 28:
            raise IntegrityError("Ciphertext payload too short")
        nonce = blob[:12]
        ciphertext_and_tag = blob[12:]
        aesgcm = AESGCM(vault_key)
        try:
            return aesgcm.decrypt(nonce, ciphertext_and_tag, aad)
        except InvalidTag as e:
            raise IntegrityError("Payload authentication failed (tampered data or wrong AAD)") from e

    @staticmethod
    def zero_buffer(buf: bytearray) -> None:
        for i in range(len(buf)):
            buf[i] = 0
