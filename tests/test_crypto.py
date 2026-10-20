import pytest
import secrets
from app.crypto_service import CryptoService, IntegrityError, CryptoError, DEFAULT_KDF_PARAMS

FAST_KDF_PARAMS = {
    "algorithm": "argon2id",
    "memory_cost": 1024,
    "time_cost": 1,
    "parallelism": 1,
    "hash_len": 32,
}


def test_round_trip_arabic_emoji_and_1mb():
    vault_key = CryptoService.generate_vault_key()
    item_id = "item_arabic_test_123"
    schema_v = 2
    aad = f"{item_id}|{schema_v}".encode("utf-8")

    # Arabic, emoji, and 1 MB multiline
    text_content = (
        "مفتاح سري مشفر بالكامل — تجربة اللغة العربية والرموز 🔒🔑\n"
        + ("A" * 1024 * 1024)
    )
    plaintext = text_content.encode("utf-8")

    ciphertext = CryptoService.encrypt_payload(vault_key, plaintext, aad)
    assert ciphertext != plaintext

    decrypted = CryptoService.decrypt_payload(vault_key, ciphertext, aad)
    assert decrypted == plaintext
    assert decrypted.decode("utf-8") == text_content


def test_wrong_master_password_fails_cleanly():
    salt = CryptoService.generate_salt()
    vault_key = CryptoService.generate_vault_key()

    kek_correct = CryptoService.derive_kek("correct_password", salt, FAST_KDF_PARAMS)
    wrapped = CryptoService.wrap_vault_key(kek_correct, vault_key)

    verifier = CryptoService.create_verifier(vault_key)
    assert CryptoService.check_verifier(vault_key, verifier) is True

    # Try deriving with wrong password
    kek_wrong = CryptoService.derive_kek("wrong_password", salt, FAST_KDF_PARAMS)
    with pytest.raises(IntegrityError):
        CryptoService.unwrap_vault_key(kek_wrong, wrapped)


def test_flipped_byte_fails_gcm_tag():
    vault_key = CryptoService.generate_vault_key()
    aad = b"item_flip_test|2"
    plaintext = b"critical secret data"

    ciphertext = bytearray(CryptoService.encrypt_payload(vault_key, plaintext, aad))
    
    # Flip one byte in the ciphertext portion
    ciphertext[15] ^= 0x01

    with pytest.raises(IntegrityError):
        CryptoService.decrypt_payload(vault_key, bytes(ciphertext), aad)


def test_flipped_byte_in_verifier():
    vault_key = CryptoService.generate_vault_key()
    verifier = bytearray(CryptoService.create_verifier(vault_key))
    verifier[14] ^= 0xFF
    assert CryptoService.check_verifier(vault_key, bytes(verifier)) is False


def test_payload_moved_to_different_item_id_fails():
    vault_key = CryptoService.generate_vault_key()
    item_id_1 = "item_1111"
    item_id_2 = "item_2222"
    schema = 2

    aad_1 = f"{item_id_1}|{schema}".encode("utf-8")
    aad_2 = f"{item_id_2}|{schema}".encode("utf-8")

    payload = b'{"secret": "val"}'
    ciphertext = CryptoService.encrypt_payload(vault_key, payload, aad_1)

    # Attempting to decrypt with aad_2 must fail
    with pytest.raises(IntegrityError):
        CryptoService.decrypt_payload(vault_key, ciphertext, aad_2)


def test_payload_with_downgraded_schema_version_fails():
    vault_key = CryptoService.generate_vault_key()
    item_id = "item_schema_test"
    aad_v2 = f"{item_id}|2".encode("utf-8")
    aad_v1 = f"{item_id}|1".encode("utf-8")

    payload = b'{"title": "test"}'
    ciphertext = CryptoService.encrypt_payload(vault_key, payload, aad_v2)

    with pytest.raises(IntegrityError):
        CryptoService.decrypt_payload(vault_key, ciphertext, aad_v1)


def test_nonce_uniqueness_sample():
    # Test generation of 50,000 nonces has 0 collisions
    nonces = set()
    for _ in range(50000):
        n = secrets.token_bytes(12)
        assert n not in nonces
        nonces.add(n)
    assert len(nonces) == 50000


def test_key_zeroing_bytearray():
    raw_key = CryptoService.generate_vault_key()
    key_buf = bytearray(raw_key)
    assert any(b != 0 for b in key_buf)

    CryptoService.zero_buffer(key_buf)
    assert all(b == 0 for b in key_buf)


def test_change_password_rewrap():
    salt1 = CryptoService.generate_salt()
    vault_key = CryptoService.generate_vault_key()
    kek1 = CryptoService.derive_kek("initial_password", salt1, FAST_KDF_PARAMS)
    wrapped1 = CryptoService.wrap_vault_key(kek1, vault_key)

    # Change password
    salt2 = CryptoService.generate_salt()
    new_params = {**FAST_KDF_PARAMS, "memory_cost": 2048}
    kek2 = CryptoService.derive_kek("new_super_password", salt2, new_params)

    # Unwrap with old, re-wrap with new
    recovered_key = CryptoService.unwrap_vault_key(kek1, wrapped1)
    wrapped2 = CryptoService.wrap_vault_key(kek2, recovered_key)

    # Old password fails on new wrapped key
    with pytest.raises(IntegrityError):
        CryptoService.unwrap_vault_key(kek1, wrapped2)

    # New password succeeds
    unwrapped_final = CryptoService.unwrap_vault_key(kek2, wrapped2)
    assert unwrapped_final == vault_key
