"""Smoke tests — verify the app starts and basic routes respond."""


def test_root_redirects_to_login(client):
    """GET / should redirect to /login."""
    response = client.get("/", follow_redirects=False)
    assert response.status_code == 307
    assert "/login" in response.headers["location"]


def test_openapi_schema(client):
    """OpenAPI schema should be accessible."""
    response = client.get("/openapi.json")
    assert response.status_code == 200
    data = response.json()
    assert data["info"]["title"] == "Kegelkasse"
