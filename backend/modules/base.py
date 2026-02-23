from abc import ABC, abstractmethod
from typing import Any


class BaseModule(ABC):
    """Base class for all dashboard data modules.

    To add a new module:
      1. Create a file in modules/ that subclasses BaseModule.
      2. Set module_id and default interval.
      3. Implement collect() returning a JSON-serialisable dict.
      4. Register the class in main.py MODULE_REGISTRY.
      5. Enable it in config.yaml.
    """

    module_id: str = ""
    interval: int = 60  # default polling interval in seconds

    @abstractmethod
    async def collect(self) -> dict[str, Any]:
        """Collect and return the module's current data snapshot."""
        ...
