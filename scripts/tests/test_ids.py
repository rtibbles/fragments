from scripts.corpus_builder.ids import stable_doc_id

def test_id_is_12_lowercase_hex_chars():
    did = stable_doc_id("References/Opacity & Refusal/Glissant_Edouard_Poetics_of_Relation.pdf")
    assert len(did) == 12
    assert all(c in "0123456789abcdef" for c in did)

def test_id_is_deterministic():
    path = "References/Queer Abstraction/Dragging Away/"
    assert stable_doc_id(path) == stable_doc_id(path)

def test_different_paths_produce_different_ids():
    a = stable_doc_id("References/A.pdf")
    b = stable_doc_id("References/B.pdf")
    assert a != b
