from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Any, Dict

from flask import Flask, jsonify, render_template, request
from werkzeug.exceptions import HTTPException

from firewall_client import FirewallClient, FirewallCommandError, SSHConfig
from firewall_parser import FirewallChain

app = Flask(__name__, static_folder="static", template_folder="templates")


def _config_path() -> Path:
    return Path(__file__).with_name("config.json")


@lru_cache(maxsize=1)
def _client() -> FirewallClient:
    config_file = _config_path()
    if not config_file.exists():
        raise FileNotFoundError(
            "Missing config.json. Copy config.example.json and update it with "
            "the remote device credentials."
        )
    return FirewallClient(SSHConfig.from_file(config_file))


@app.route("/")
def index() -> str:
    return render_template("index.html")


def _serialize_chain(chain: FirewallChain) -> Dict[str, Any]:
    return {
        "name": chain.name,
        "policy": chain.policy,
        "references": chain.references,
        "rules": [
            {
                "number": rule.number,
                "target": rule.target,
                "protocol": rule.protocol,
                "option": rule.option,
                "source": rule.source,
                "destination": rule.destination,
                "details": [
                    {
                        "label": detail.label,
                        "value": detail.value,
                        **({"key": detail.key} if detail.key else {}),
                    }
                    for detail in rule.details
                ],
                "raw": rule.raw,
            }
            for rule in chain.rules
        ],
    }


@app.route("/api/rules", methods=["GET"])
def list_rules() -> Any:
    try:
        chains = _client().fetch_chains()
    except FileNotFoundError as exc:
        return jsonify({"error": str(exc)}), 500
    except FirewallCommandError as exc:
        return jsonify({"error": str(exc)}), 500
    return jsonify({"chains": [_serialize_chain(chain) for chain in chains]})


@app.route("/api/rules", methods=["POST"])
def add_rule() -> Any:
    payload: Dict[str, Any] = request.get_json(force=True)
    chain = payload.get("chain")
    specification = payload.get("specification")
    position = payload.get("position")

    if not chain or not specification:
        return jsonify({"error": "chain and specification are required"}), 400

    try:
        _client().add_rule(chain, specification, position)
    except FirewallCommandError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"status": "ok"})


@app.route("/api/rules/<chain>/<int:number>", methods=["PUT"])
def replace_rule(chain: str, number: int) -> Any:
    payload: Dict[str, Any] = request.get_json(force=True)
    specification = payload.get("specification")
    if not specification:
        return jsonify({"error": "specification is required"}), 400

    try:
        _client().replace_rule(chain, number, specification)
    except FirewallCommandError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"status": "ok"})


@app.route("/api/rules/<chain>/<int:number>", methods=["DELETE"])
def delete_rule(chain: str, number: int) -> Any:
    try:
        _client().delete_rule(chain, number)
    except FirewallCommandError as exc:
        return jsonify({"error": str(exc)}), 400

    return jsonify({"status": "ok"})


@app.errorhandler(Exception)
def handle_exception(exc: Exception) -> Any:
    if isinstance(exc, HTTPException):
        if request.path.startswith("/api/"):
            return jsonify({"error": exc.description}), exc.code
        return exc

    app.logger.exception("Unhandled error: %s", exc)
    if request.path.startswith("/api/"):
        return jsonify({"error": str(exc)}), 500
    raise exc


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8000, debug=True)
