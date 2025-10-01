"""Utilities for parsing iptables output into structured data."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional
import re


@dataclass
class RuleDetail:
    label: str
    value: Optional[str] = None
    key: Optional[str] = None


@dataclass
class FirewallRule:
    number: int
    target: str
    protocol: str
    option: str
    source: str
    destination: str
    details: List[RuleDetail] = field(default_factory=list)
    raw: str = ""


@dataclass
class FirewallChain:
    name: str
    policy: Optional[str] = None
    references: Optional[int] = None
    rules: List[FirewallRule] = field(default_factory=list)


CHAIN_HEADER_RE = re.compile(r"^Chain\s+(?P<name>\S+)\s+\((?P<descriptor>[^)]*)\)")


def _parse_chain_descriptor(descriptor: str) -> Dict[str, Optional[str]]:
    result: Dict[str, Optional[str]] = {"policy": None, "references": None}
    descriptor = descriptor.strip()
    policy_match = re.search(r"policy\s+(?P<policy>\S+)", descriptor)
    if policy_match:
        result["policy"] = policy_match.group("policy")

    ref_match = re.search(r"(?P<count>\d+)\s+references", descriptor)
    if ref_match:
        result["references"] = int(ref_match.group("count"))

    return result


BREAK_AFTER_VALUE = {"TCPMSS"}


def _parse_rule_details(extra: List[str]) -> List[RuleDetail]:
    details: List[RuleDetail] = []
    prefix_parts: List[str] = []

    def normalise_key(raw: Optional[str]) -> Optional[str]:
        if not raw:
            return None
        key = raw.strip().lower().rstrip(":")
        if not key:
            return None
        return key

    def push(label: str, value_tokens: List[str], key: Optional[str] = None) -> None:
        value = " ".join(value_tokens).strip() if value_tokens else None
        details.append(
            RuleDetail(label=label.strip(), value=value or None, key=normalise_key(key))
        )

    i = 0
    length = len(extra)
    while i < length:
        token = extra[i]

        if ":" in token:
            label_part, value_part = token.split(":", 1)
            label = " ".join(prefix_parts + [label_part]).strip()
            prefix_parts = []

            value_tokens: List[str] = [value_part] if value_part else []
            i += 1
            while i < length:
                lookahead = extra[i]
                if ":" in lookahead or lookahead.endswith(":"):
                    break
                if lookahead in BREAK_AFTER_VALUE and value_tokens:
                    break
                value_tokens.append(lookahead)
                i += 1

            push(label or label_part, value_tokens, label_part)
            continue

        # token without colon may serve as prefix for the next colon token
        if i + 1 < length and ":" in extra[i + 1]:
            prefix_parts.append(token)
            i += 1
            continue

        label_tokens = prefix_parts + [token]
        prefix_parts = []
        i += 1
        value_tokens: List[str] = []
        while i < length:
            lookahead = extra[i]
            if ":" in lookahead or lookahead.endswith(":"):
                break
            if lookahead in BREAK_AFTER_VALUE and value_tokens:
                break
            value_tokens.append(lookahead)
            i += 1

        push(" ".join(label_tokens), value_tokens, label_tokens[-1] if label_tokens else None)

    if prefix_parts:
        push(" ".join(prefix_parts), [], prefix_parts[-1] if prefix_parts else None)

    return details


def parse_iptables_output(output: str) -> List[FirewallChain]:
    """Parse the raw output of ``iptables -L -n --line-numbers``.

    Args:
        output: Raw command output.

    Returns:
        Structured representation grouped by chain.
    """
    chains: List[FirewallChain] = []
    current_chain: Optional[FirewallChain] = None

    for line in output.splitlines():
        stripped = line.strip()
        if not stripped:
            continue

        header_match = CHAIN_HEADER_RE.match(stripped)
        if header_match:
            descriptor = header_match.group("descriptor")
            chain_info = _parse_chain_descriptor(descriptor)
            current_chain = FirewallChain(
                name=header_match.group("name"),
                policy=chain_info.get("policy"),
                references=chain_info.get("references"),
            )
            chains.append(current_chain)
            continue

        if stripped.startswith("num ") or stripped.startswith("target "):
            # Header rows inside the chain; skip them.
            continue

        if current_chain is None:
            # Defensive: skip any rule lines before a chain header.
            continue

        parts = stripped.split()
        if len(parts) < 6:
            # Unexpected format; keep as raw detail entry.
            rule = FirewallRule(
                number=0,
                target=stripped,
                protocol="",
                option="",
                source="",
                destination="",
                details=[RuleDetail(label=stripped)],
                raw=stripped,
            )
            current_chain.rules.append(rule)
            continue

        number = int(parts[0])
        target = parts[1]
        protocol = parts[2]
        option = parts[3]
        source = parts[4]
        destination = parts[5]
        extra = parts[6:]
        details = _parse_rule_details(extra) if extra else []

        rule = FirewallRule(
            number=number,
            target=target,
            protocol=protocol,
            option=option,
            source=source,
            destination=destination,
            details=details,
            raw=stripped,
        )
        current_chain.rules.append(rule)

    return chains


__all__ = [
    "FirewallChain",
    "FirewallRule",
    "RuleDetail",
    "parse_iptables_output",
]
