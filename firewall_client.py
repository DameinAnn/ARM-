"""SSH client wrapper for interacting with iptables on remote ARM devices."""
from __future__ import annotations

import json
import shlex
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

import paramiko

from firewall_parser import FirewallChain, parse_iptables_output


class FirewallCommandError(RuntimeError):
    """Raised when an iptables command fails on the remote host."""

    def __init__(self, command: Iterable[str], exit_status: int, stderr: str) -> None:
        self.command = list(command)
        self.exit_status = exit_status
        self.stderr = stderr
        super().__init__(
            f"Command '{' '.join(self.command)}' failed with exit status "
            f"{exit_status}: {stderr.strip()}"
        )


@dataclass
class SSHConfig:
    host: str
    username: str
    password: Optional[str] = None
    port: int = 22
    key_filename: Optional[str] = None
    timeout: int = 10
    list_command: str = "iptables -L -n --line-numbers"

    @classmethod
    def from_file(cls, path: Path) -> "SSHConfig":
        with path.open("r", encoding="utf-8") as fh:
            payload: Dict[str, Any] = json.load(fh)
        return cls(**payload)


class FirewallClient:
    """High-level interface for managing iptables rules over SSH."""

    def __init__(self, config: SSHConfig) -> None:
        self.config = config

    @classmethod
    def from_config_file(cls, path: Path) -> "FirewallClient":
        config = SSHConfig.from_file(path)
        return cls(config)

    def _connect(self) -> paramiko.SSHClient:
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=self.config.host,
            port=self.config.port,
            username=self.config.username,
            password=self.config.password,
            key_filename=self.config.key_filename,
            timeout=self.config.timeout,
        )
        return client

    def _run(self, command: Iterable[str] | str) -> str:
        if isinstance(command, str):
            command = shlex.split(command)
        command = list(command)
        with closing(self._connect()) as client:
            stdin, stdout, stderr = client.exec_command(
                " ".join(shlex.quote(part) for part in command)
            )
            stdout_data = stdout.read().decode("utf-8", errors="replace")
            stderr_data = stderr.read().decode("utf-8", errors="replace")
            exit_status = stdout.channel.recv_exit_status()
        if exit_status != 0:
            raise FirewallCommandError(command, exit_status, stderr_data)
        return stdout_data

    def fetch_chains(self) -> List[FirewallChain]:
        output = self._run(self.config.list_command)
        return parse_iptables_output(output)

    def add_rule(self, chain: str, specification: str, position: Optional[int] = None) -> None:
        command: List[str] = ["iptables"]
        if position is not None:
            command += ["-I", chain, str(position)]
        else:
            command += ["-A", chain]
        command += shlex.split(specification)
        self._run(command)

    def replace_rule(self, chain: str, number: int, specification: str) -> None:
        command: List[str] = ["iptables", "-R", chain, str(number)]
        command += shlex.split(specification)
        self._run(command)

    def delete_rule(self, chain: str, number: int) -> None:
        command = ["iptables", "-D", chain, str(number)]
        self._run(command)


__all__ = [
    "FirewallClient",
    "FirewallCommandError",
    "SSHConfig",
]
