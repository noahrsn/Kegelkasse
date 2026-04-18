"""Azure Cosmos DB client wrapper.

Provides a singleton client with per-container access.
All group-scoped containers use `group_id` as partition key.
"""

from __future__ import annotations

from typing import Any, Optional

from azure.cosmos import CosmosClient, ContainerProxy, DatabaseProxy, PartitionKey
from azure.cosmos.exceptions import CosmosResourceNotFoundError

from app.config import get_settings

# Container names and their partition keys
CONTAINERS: dict[str, str] = {
    "users": "/id",
    "groups": "/id",
    "penalties_catalog": "/group_id",
    "sessions": "/group_id",
    "events": "/group_id",
    "debts": "/group_id",
    "transactions": "/group_id",
    "awards": "/group_id",
    "logs": "/group_id",
    "polls": "/group_id",
}


class CosmosDB:
    """Singleton wrapper around the Azure Cosmos DB Python SDK."""

    _instance: Optional[CosmosDB] = None

    def __init__(self) -> None:
        settings = get_settings()
        self._endpoint = settings.cosmos_endpoint
        self._key = settings.cosmos_key
        self._database_name = settings.cosmos_database
        # Lazy: client/db created on first actual operation
        self._client: Optional[CosmosClient] = None
        self._db: Optional[DatabaseProxy] = None
        self._containers: dict[str, ContainerProxy] = {}

    def _ensure_client(self) -> None:
        if self._client is None:
            self._client = CosmosClient(self._endpoint, self._key)
            self._db = self._client.get_database_client(self._database_name)

    @classmethod
    def get(cls) -> CosmosDB:
        if cls._instance is None:
            cls._instance = CosmosDB()
        return cls._instance

    @classmethod
    def reset(cls) -> None:
        """Reset the singleton (useful for testing)."""
        cls._instance = None

    def ensure_containers(self) -> None:
        """Create database and containers if they don't exist yet."""
        self._ensure_client()
        self._client.create_database_if_not_exists(self._database_name)
        for name, pk_path in CONTAINERS.items():
            self._db.create_container_if_not_exists(
                id=name,
                partition_key=PartitionKey(path=pk_path),
            )

    def container(self, name: str) -> ContainerProxy:
        self._ensure_client()
        if name not in self._containers:
            self._containers[name] = self._db.get_container_client(name)
        return self._containers[name]

    # ── Generic CRUD ────────────────────────────────────────────────────

    def create_item(self, container_name: str, item: dict[str, Any]) -> dict[str, Any]:
        return self.container(container_name).create_item(body=item)

    def upsert_item(self, container_name: str, item: dict[str, Any]) -> dict[str, Any]:
        return self.container(container_name).upsert_item(body=item)

    def read_item(
        self, container_name: str, item_id: str, partition_key: str
    ) -> Optional[dict[str, Any]]:
        try:
            return self.container(container_name).read_item(
                item=item_id, partition_key=partition_key
            )
        except CosmosResourceNotFoundError:
            return None

    def delete_item(
        self, container_name: str, item_id: str, partition_key: str
    ) -> None:
        try:
            self.container(container_name).delete_item(
                item=item_id, partition_key=partition_key
            )
        except CosmosResourceNotFoundError:
            pass

    def query_items(
        self,
        container_name: str,
        query: str,
        parameters: Optional[list[dict[str, Any]]] = None,
        partition_key: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        kwargs: dict[str, Any] = {"query": query, "enable_cross_partition_query": True}
        if parameters:
            kwargs["parameters"] = parameters
        if partition_key is not None:
            kwargs["partition_key"] = partition_key
            kwargs["enable_cross_partition_query"] = False
        return list(self.container(container_name).query_items(**kwargs))


def get_db() -> CosmosDB:
    """FastAPI dependency — returns the singleton CosmosDB instance."""
    return CosmosDB.get()
