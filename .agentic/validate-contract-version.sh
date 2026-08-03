#!/usr/bin/env bash
set -euo pipefail
export LC_ALL=C

target="${1:-.}"
target="$(cd "$target" && pwd)"
canonical_root="${2:-}"

if [[ -n "$canonical_root" ]]; then
  canonical_root="$(cd "$canonical_root" && pwd)"
elif [[ -f "$target/protocol/protocol.md" ]]; then
  canonical_root="$target"
fi

read_protocol_version() {
  sed -n 's/^# Loop Protocol — v\([0-9][0-9.]*\)$/\1/p' "$1" | head -n 1
}

read_contract_version() {
  sed -n 's/^\*\*Protocol version:\*\* v\([0-9][0-9.]*\)$/\1/p' "$1" | head -n 1
}

manifest_value() {
  sed -n "s/^$1: \"\\([^\"]*\\)\"$/\\1/p" "$2" | head -n 1
}

sha256_file() {
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

require_file() {
  if [[ ! -f "$1" ]]; then
    echo "missing required file: $1" >&2
    exit 1
  fi
}

if [[ -d "$target/.agentic" ]]; then
  contract_root="$target/.agentic"
  protocol="$contract_root/protocol.md"
  executor="$contract_root/EXECUTOR.md"
  policy="$contract_root/PROJECT_POLICY.md"
  manifest="$contract_root/protocol-installation.yml"
elif [[ -f "$target/SKILL.md" && -f "$target/references/protocol.md" ]]; then
  contract_root="$target"
  protocol="$target/references/protocol.md"
  executor="$target/assets/repo-contract/EXECUTOR.md"
  policy="$target/assets/repo-contract/PROJECT_POLICY.template.md"
  manifest=""
elif [[ -f "$target/protocol/protocol.md" ]]; then
  contract_root="$target/protocol"
  protocol="$contract_root/protocol.md"
  executor="$contract_root/EXECUTOR.md"
  policy="$contract_root/PROJECT_POLICY.template.md"
  manifest=""
else
  echo "target has neither .agentic/ nor canonical protocol/ contract: $target" >&2
  exit 2
fi

require_file "$protocol"
require_file "$executor"
require_file "$policy"

protocol_version="$(read_protocol_version "$protocol")"
executor_version="$(read_contract_version "$executor")"
policy_version="$(read_contract_version "$policy")"

if [[ -z "$protocol_version" || -z "$executor_version" || -z "$policy_version" ]]; then
  echo "one or more protocol version markers are missing" >&2
  exit 1
fi

if [[ "$protocol_version" != "$executor_version" || "$protocol_version" != "$policy_version" ]]; then
  echo "contract version mismatch: protocol=$protocol_version executor=$executor_version policy=$policy_version" >&2
  exit 1
fi

if [[ -n "$manifest" ]]; then
  require_file "$manifest"
  manifest_version="$(manifest_value protocol_version "$manifest")"
  source="$(manifest_value source "$manifest")"
  mode="$(manifest_value mode "$manifest")"
  recorded_sha256="$(manifest_value canonical_sha256 "$manifest")"
  installed_sha256="$(sha256_file "$protocol")"

  if [[ "$manifest_version" != "$protocol_version" ]]; then
    echo "manifest version mismatch: manifest=$manifest_version protocol=$protocol_version" >&2
    exit 1
  fi
  if [[ "$source" != "career-os/protocol/protocol.md" ]]; then
    echo "unknown canonical source: ${source:-missing}" >&2
    exit 1
  fi

  if [[ -z "$recorded_sha256" || "$recorded_sha256" != "$installed_sha256" ]]; then
    echo "installed protocol drift: recorded=$recorded_sha256 actual=$installed_sha256" >&2
    exit 1
  fi

  case "$mode" in
    generated)
      if [[ -e "$contract_root/PROTOCOL_OVERRIDE.md" ]]; then
        echo "undeclared protocol override: set manifest mode to override" >&2
        exit 1
      fi
      ;;
    override)
      override="$contract_root/PROTOCOL_OVERRIDE.md"
      require_file "$override"
      override_version="$(sed -n 's/^\*\*Base protocol version:\*\* v\([0-9][0-9.]*\)$/\1/p' "$override" | head -n 1)"
      override_status="$(sed -n 's/^\*\*Status:\*\* \(.*\)$/\1/p' "$override" | head -n 1)"
      approved_by="$(sed -n 's/^\*\*Approved by:\*\* \(.*\)$/\1/p' "$override" | head -n 1)"
      approved_on="$(sed -n 's/^\*\*Approved on:\*\* \(.*\)$/\1/p' "$override" | head -n 1)"

      if [[ "$override_version" != "$protocol_version" || "$override_status" != "approved" ]]; then
        echo "protocol override is not approved for v$protocol_version" >&2
        exit 1
      fi
      if [[ -z "$approved_by" || "$approved_by" == *"<"* || -z "$approved_on" || "$approved_on" == *"<"* ]]; then
        echo "protocol override approval metadata is incomplete" >&2
        exit 1
      fi
      ;;
    *)
      echo "invalid installation mode: ${mode:-missing}" >&2
      exit 1
      ;;
  esac

  if [[ -n "$canonical_root" ]]; then
    canonical_protocol="$canonical_root/protocol/protocol.md"
    require_file "$canonical_protocol"
    canonical_version="$(read_protocol_version "$canonical_protocol")"
    canonical_sha256="$(sha256_file "$canonical_protocol")"

    if [[ "$canonical_version" != "$protocol_version" ]]; then
      echo "canonical version mismatch: canonical=$canonical_version installed=$protocol_version" >&2
      exit 1
    fi
    if [[ "$canonical_sha256" != "$installed_sha256" ]]; then
      echo "installed copy differs from canonical: canonical=$canonical_sha256 installed=$installed_sha256" >&2
      exit 1
    fi
  fi
fi

echo "contract versions match: v$protocol_version"
if [[ -n "$manifest" ]]; then
  echo "protocol installation valid: mode=$mode sha256=$installed_sha256"
fi
