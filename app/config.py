from functools import lru_cache

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Cosmos DB
    cosmos_endpoint: str = ""
    cosmos_key: str = ""
    cosmos_database: str = "kegelkasse"

    # JWT Auth
    jwt_secret: str = "change-me"
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 1440  # 24h

    # SendGrid
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@kegelkasse.de"

    # Environment
    environment: str = "development"

    # Cosmos startup behavior
    # If true, a Cosmos connectivity/init error will fail the app startup.
    cosmos_strict_startup: bool = False

    # App
    app_host: str = "0.0.0.0"
    # Azure App Service (Linux) commonly injects PORT or WEBSITES_PORT.
    app_port: int = Field(
        default=8000,
        validation_alias=AliasChoices("APP_PORT", "PORT", "WEBSITES_PORT"),
    )
    app_base_url: str = "http://localhost:8000"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache
def get_settings() -> Settings:
    return Settings()
