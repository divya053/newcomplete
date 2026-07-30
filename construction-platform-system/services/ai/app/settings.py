"""Config validated at boot — fail fast (ws 0.6, guardrail #10).

Pydantic Settings is the Python mirror of apps/web/src/lib/env.ts: a missing or
invalid secret raises at startup, not at first use. Code reads from `settings`,
never os.environ directly. Secrets are env-injected from the manager (the source
is an open decision — design behind this seam, swap later).
"""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    redis_url: str = Field(alias="REDIS_URL")
    anthropic_api_key: str = Field(alias="ANTHROPIC_API_KEY")
    voyage_api_key: str = Field(alias="VOYAGE_API_KEY")
    langfuse_public_key: str = Field(default="", alias="LANGFUSE_PUBLIC_KEY")
    langfuse_secret_key: str = Field(default="", alias="LANGFUSE_SECRET_KEY")
    langfuse_host: str = Field(default="http://localhost:3001", alias="LANGFUSE_HOST")


@lru_cache
def get_settings() -> Settings:
    return Settings()  # raises at boot if a required secret is missing
