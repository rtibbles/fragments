import hashlib

def stable_doc_id(file_location: str) -> str:
    """Return the first 12 hex chars of SHA-256(file_location).

    Stable across runs so localStorage citations remain valid after rebuilds.
    """
    digest = hashlib.sha256(file_location.encode("utf-8")).hexdigest()
    return digest[:12]
