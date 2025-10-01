const CHAIN_OPTIONS = ["INPUT", "OUTPUT", "FORWARD", "PREROUTING", "POSTROUTING"];
const TARGET_OPTIONS = ["ACCEPT", "DROP", "REJECT", "LOG", "RETURN"];
const PROTOCOL_OPTIONS = ["tcp", "udp", "icmp", "all"];
const ADDRESS_OPTIONS = ["0.0.0.0/0", "127.0.0.1", "192.168.0.0/16", "10.0.0.0/8", "::/0"];
const PORT_KEYS = new Set(["dpt", "dport", "spt", "sport"]);
const state = {
  chains: [],
  viewMode: "chain",
  search: "",
  loading: false,
};

const rulesContainer = document.getElementById("rulesContainer");
const errorAlert = document.getElementById("errorAlert");
const refreshButton = document.getElementById("refreshButton");
const addRuleButton = document.getElementById("addRuleButton");
const searchInput = document.getElementById("searchInput");
const viewChains = document.getElementById("viewChains");
const viewTargets = document.getElementById("viewTargets");
const ruleModalElement = document.getElementById("ruleModal");
const ruleModalForm = document.getElementById("ruleModalForm");
const ruleModalTitle = document.getElementById("ruleModalLabel");
const ruleModalChainSelect = document.getElementById("ruleChainSelect");
const ruleModalTargetSelect = document.getElementById("ruleTargetSelect");
const ruleModalProtocolSelect = document.getElementById("ruleProtocolSelect");
const ruleModalSourceSelect = document.getElementById("ruleSourceSelect");
const ruleModalDestinationSelect = document.getElementById("ruleDestinationSelect");
const ruleSourcePortInput = document.getElementById("ruleSourcePortInput");
const ruleDestinationPortInput = document.getElementById("ruleDestinationPortInput");
const ruleAdvancedInput = document.getElementById("ruleAdvancedInput");
const ruleModalSaveButton = document.getElementById("ruleModalSaveButton");
const ruleModal = ruleModalElement ? new bootstrap.Modal(ruleModalElement) : null;

let ruleModalContext = null;

function uniqueOptions(...groups) {
  const seen = new Set();
  const result = [];
  groups.forEach((group) => {
    if (!group) {
      return;
    }
    const iterable = Array.isArray(group)
      ? group
      : group instanceof Set
      ? Array.from(group)
      : [group];
    iterable.forEach((value) => {
      if (!value || seen.has(value)) {
        return;
      }
      seen.add(value);
      result.push(value);
    });
  });
  return result;
}

function populateSelect(select, options, selectedValue = "") {
  if (!select) {
    return;
  }
  const seen = new Set();
  select.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "请选择";
  select.appendChild(placeholder);

  options.forEach((value) => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    select.appendChild(option);
  });

  if (selectedValue && !seen.has(selectedValue)) {
    const option = document.createElement("option");
    option.value = selectedValue;
    option.textContent = selectedValue;
    select.appendChild(option);
    seen.add(selectedValue);
  }

  select.value = selectedValue || "";
}

function extractPort(details, key) {
  if (!details) {
    return "";
  }
  const lowerKey = key.toLowerCase();
  const match = details.find((detail) => {
    if (!detail) {
      return false;
    }
    const detailKey = (detail.key || "").toLowerCase();
    if (detailKey === lowerKey) {
      return true;
    }
    const label = (detail.label || "").toLowerCase();
    return label === lowerKey || label.endsWith(` ${lowerKey}`);
  });
  return match && match.value ? match.value : "";
}

function buildAdvancedText(rule) {
  if (!rule) {
    return "";
  }
  const segments = [];
  if (rule.option && rule.option !== "--") {
    segments.push(rule.option);
  }
  (rule.details || []).forEach((detail) => {
    if (!detail) {
      return;
    }
    const key = (detail.key || "").toLowerCase();
    if (PORT_KEYS.has(key)) {
      return;
    }
    const label = (detail.label || "").trim();
    const value = (detail.value || "").trim();
    if (!label && !value) {
      return;
    }
    if (label && value) {
      segments.push(`${label}:${value}`);
    } else {
      segments.push(label || value);
    }
  });
  return segments.join(" ").trim();
}

if (ruleModalElement) {
  ruleModalElement.addEventListener("hidden.bs.modal", () => {
    ruleModalContext = null;
    if (ruleModalForm) {
      ruleModalForm.reset();
    }
    if (ruleModalChainSelect) {
      ruleModalChainSelect.disabled = false;
    }
    if (ruleSourcePortInput) {
      ruleSourcePortInput.value = "";
    }
    if (ruleDestinationPortInput) {
      ruleDestinationPortInput.value = "";
    }
    if (ruleAdvancedInput) {
      ruleAdvancedInput.value = "";
    }
  });
}

function openRuleModal({ mode, initialRule }) {
  if (!ruleModal || !ruleModalForm) {
    console.warn("Rule modal is not available in this context.");
    return;
  }

  const preparedRule = initialRule
    ? {
        ...initialRule,
        details: (initialRule.details || []).map((detail) => ({ ...detail })),
      }
    : null;

  ruleModalContext = { mode, initialRule: preparedRule };
  ruleModalForm.reset();

  const chainOptions = uniqueOptions(
    CHAIN_OPTIONS,
    state.chains.map((chain) => chain.name),
    preparedRule ? [preparedRule.chain] : []
  );
  const targetOptions = uniqueOptions(
    TARGET_OPTIONS,
    state.chains.flatMap((chain) => chain.rules.map((rule) => rule.target)),
    preparedRule ? [preparedRule.target] : []
  );
  const protocolOptions = uniqueOptions(
    PROTOCOL_OPTIONS,
    state.chains.flatMap((chain) => chain.rules.map((rule) => rule.protocol)),
    preparedRule ? [preparedRule.protocol] : []
  );
  const sourceOptions = uniqueOptions(
    ADDRESS_OPTIONS,
    state.chains.flatMap((chain) => chain.rules.map((rule) => rule.source)),
    preparedRule ? [preparedRule.source] : []
  );
  const destinationOptions = uniqueOptions(
    ADDRESS_OPTIONS,
    state.chains.flatMap((chain) => chain.rules.map((rule) => rule.destination)),
    preparedRule ? [preparedRule.destination] : []
  );

  populateSelect(
    ruleModalTargetSelect,
    targetOptions,
    preparedRule ? preparedRule.target : ""
  );
  populateSelect(
    ruleModalProtocolSelect,
    protocolOptions,
    preparedRule ? preparedRule.protocol : ""
  );
  populateSelect(
    ruleModalSourceSelect,
    sourceOptions,
    preparedRule ? preparedRule.source : ""
  );
  populateSelect(
    ruleModalDestinationSelect,
    destinationOptions,
    preparedRule ? preparedRule.destination : ""
  );

  if (ruleModalChainSelect) {
    ruleModalChainSelect.disabled = mode === "edit";
  }
  if (ruleModalTitle) {
    ruleModalTitle.textContent = mode === "edit" ? "编辑规则" : "新增规则";
  }
  if (ruleModalSaveButton) {
    ruleModalSaveButton.textContent = mode === "edit" ? "保存修改" : "保存";
  }

  const details = preparedRule ? preparedRule.details || [] : [];
  if (ruleSourcePortInput) {
    const sourcePort = preparedRule
      ? extractPort(details, "spt") || extractPort(details, "sport")
      : "";
    ruleSourcePortInput.value = sourcePort;
  }
  if (ruleDestinationPortInput) {
    const destinationPort = preparedRule
      ? extractPort(details, "dpt") || extractPort(details, "dport")
      : "";
    ruleDestinationPortInput.value = destinationPort;
  }
  if (ruleAdvancedInput) {
    ruleAdvancedInput.value = preparedRule ? buildAdvancedText(preparedRule) : "";
  }

  ruleModal.show();
}

async function handleRuleModalSubmit(event) {
  if (!ruleModalContext) {
    return;
  }
  event.preventDefault();

  const { mode, initialRule } = ruleModalContext;
  const chainValue = ruleModalChainSelect
    ? ruleModalChainSelect.value || (initialRule ? initialRule.chain : "")
    : initialRule?.chain || "";
  const targetValue = ruleModalTargetSelect ? ruleModalTargetSelect.value : "";
  const protocolValue = ruleModalProtocolSelect
    ? ruleModalProtocolSelect.value
    : "";
  const sourceValue = ruleModalSourceSelect ? ruleModalSourceSelect.value : "";
  const destinationValue = ruleModalDestinationSelect
    ? ruleModalDestinationSelect.value
    : "";
  const sourcePortValue = ruleSourcePortInput ? ruleSourcePortInput.value.trim() : "";
  const destinationPortValue = ruleDestinationPortInput
    ? ruleDestinationPortInput.value.trim()
    : "";
  const advancedValue = ruleAdvancedInput ? ruleAdvancedInput.value.trim() : "";

  if (!chainValue) {
    alert("请选择链 (Chain)");
    return;
  }
  if (!targetValue) {
    alert("请选择行为 (Target)");
    return;
  }

  const specParts = [];
  if (protocolValue && protocolValue !== "all") {
    specParts.push(`-p ${protocolValue}`);
  }
  if (sourceValue) {
    specParts.push(`-s ${sourceValue}`);
  }
  if (destinationValue) {
    specParts.push(`-d ${destinationValue}`);
  }
  if (sourcePortValue) {
    specParts.push(`--sport ${sourcePortValue}`);
  }
  if (destinationPortValue) {
    specParts.push(`--dport ${destinationPortValue}`);
  }
  specParts.push(`-j ${targetValue}`);

  let specification = specParts.join(" ").trim();
  if (advancedValue) {
    specification = specification
      ? `${specification} ${advancedValue}`
      : advancedValue;
  }

  if (!specification) {
    alert("请填写规则参数");
    return;
  }

  const originalText = ruleModalSaveButton ? ruleModalSaveButton.textContent : "";
  if (ruleModalSaveButton) {
    ruleModalSaveButton.disabled = true;
    ruleModalSaveButton.textContent = "保存中...";
  }

  hideError();

  try {
    if (mode === "edit" && initialRule) {
      const url = `/api/rules/${encodeURIComponent(initialRule.chain)}/${initialRule.number}`;
      const response = await fetch(url, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ specification }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "更新规则失败");
      }
      ruleModal.hide();
      fetchRules();
    } else {
      console.warn(`Unsupported modal mode: ${mode}`);
    }
  } catch (error) {
    showError(error.message);
  } finally {
    if (ruleModalSaveButton) {
      ruleModalSaveButton.disabled = false;
      ruleModalSaveButton.textContent = originalText || "保存";
    }
  }
}

function handleEditRule(chainName, number) {
  const chain = state.chains.find((item) => item.name === chainName);
  if (!chain) {
    return;
  }
  const rule = chain.rules.find((item) => item.number === number);
  if (!rule) {
    return;
  }
  const initialRule = {
    ...rule,
    chain: chain.name,
    details: (rule.details || []).map((detail) => ({ ...detail })),
  };
  openRuleModal({ mode: "edit", initialRule });
}

function setLoading(isLoading) {
  state.loading = isLoading;
  refreshButton.disabled = isLoading;
  refreshButton.textContent = isLoading ? "刷新中..." : "立即刷新";
}

async function fetchRules() {
  setLoading(true);
  hideError();
  try {
    const response = await fetch("/api/rules");
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "获取规则失败");
    }
    state.chains = data.chains || [];
    render();
  } catch (error) {
    showError(error.message);
  } finally {
    setLoading(false);
  }
}

function showError(message) {
  errorAlert.textContent = message;
  errorAlert.classList.remove("d-none");
}

function hideError() {
  errorAlert.classList.add("d-none");
  errorAlert.textContent = "";
}

function confirmAndDelete(chain, number) {
  if (!confirm(`确定删除 ${chain} 链中的第 ${number} 条规则吗？`)) {
    return;
  }
  fetch(`/api/rules/${encodeURIComponent(chain)}/${number}`, {
    method: "DELETE",
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "删除规则失败");
      }
      fetchRules();
    })
    .catch((error) => showError(error.message));
}

function filterChains() {
  if (!state.search) {
    return state.chains;
  }
  const keyword = state.search.toLowerCase();
  return state.chains
    .map((chain) => ({
      ...chain,
      rules: chain.rules.filter((rule) =>
        [
          rule.target,
          rule.protocol,
          rule.option,
          rule.source,
          rule.destination,
          rule.raw,
          ...(rule.details || []).map((detail) =>
            `${detail.label || ""}${detail.value ? ":" + detail.value : ""}`
          ),
        ]
          .filter(Boolean)
          .some((value) => value.toLowerCase().includes(keyword))
      ),
    }))
    .filter((chain) => chain.rules.length > 0);
}

function createDetailBadges(details, limit = Infinity) {
  if (!details || details.length === 0) {
    return "";
  }
  const visibleDetails =
    limit === Infinity ? details : details.slice(0, Math.max(0, limit));
  const remaining = Math.max(details.length - visibleDetails.length, 0);
  const badges = visibleDetails
    .map((detail) => {
      const label = escapeHtml(detail.label || "");
      const value = detail.value ? `<span>${escapeHtml(detail.value)}</span>` : "";
      return `<span class="rule-detail-badge">${label}${value}</span>`;
    })
    .join("");
  const remainderBadge =
    remaining > 0
      ? `<span class="rule-detail-badge rule-detail-badge-muted">+${remaining}</span>`
      : "";
  return `<div class="rule-detail-badges d-flex flex-wrap gap-2">${badges}${remainderBadge}</div>`;
}

function renderChainView(chains) {
  if (!chains.length) {
    rulesContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <p class="mb-0">没有符合条件的规则。</p>
      </div>`;
    return;
  }

  rulesContainer.innerHTML = chains
    .map((chain) => {
      const metaItems = [];
      if (chain.policy) {
        metaItems.push(
          `<span><i class="bi bi-shield-lock me-1"></i>策略：${escapeHtml(chain.policy)}</span>`
        );
      }
      if (typeof chain.references === "number") {
        metaItems.push(
          `<span><i class="bi bi-link-45deg me-1"></i>引用：${escapeHtml(chain.references)}</span>`
        );
      }
      metaItems.push(
        `<span><i class="bi bi-list-ol me-1"></i>规则：${escapeHtml(
          (chain.rules || []).length
        )}</span>`
      );

      const rulesMarkup = (chain.rules || [])
        .map((rule) => {
          const collapseId = buildCollapseId(chain.name, rule.number);
          const targetVisual = getTargetVisual(rule.target);
          const protocolLabel = (rule.protocol || "ALL").toUpperCase();
          const sourcePort = getPortValue(rule, "source");
          const destinationPort = getPortValue(rule, "destination");
          const portSummary = buildPortSummary(sourcePort, destinationPort);
          const detailPreview = createDetailBadges(rule.details, 2);
          const fullDetails = createDetailBadges(rule.details);
          const optionText = rule.option && rule.option !== "--" ? rule.option : "";
          const rawText = rule.raw ? `<code>${escapeHtml(rule.raw)}</code>` : "";

          return `
            <div class="rule-card card-subtle">
              <div class="rule-overview d-flex flex-column flex-lg-row gap-3">
                <div class="rule-overview-primary flex-lg-grow-1">
                  <div class="d-flex flex-wrap align-items-center gap-2">
                    <span class="${targetVisual.badgeClass}">
                      <i class="bi ${targetVisual.icon} me-1"></i>${escapeHtml(
                        rule.target || "未知"
                      )}
                    </span>
                    <span class="rule-protocol-chip">
                      <i class="bi bi-diagram-3 me-1"></i>${escapeHtml(protocolLabel)}
                    </span>
                  </div>
                  <div class="rule-port-summary text-muted small mt-2">
                    <i class="bi bi-plug me-1"></i>${portSummary}
                  </div>
                </div>
                <div class="rule-overview-secondary flex-lg-grow-1">
                  <div class="rule-address text-muted small">
                    <i class="bi bi-arrow-up-right-circle me-1 text-primary"></i>源：
                    <span class="text-body-secondary">${escapeHtml(rule.source || "任意")}</span>
                  </div>
                  <div class="rule-address text-muted small mt-1">
                    <i class="bi bi-arrow-down-left-circle me-1 text-primary"></i>目的：
                    <span class="text-body-secondary">${escapeHtml(rule.destination || "任意")}</span>
                  </div>
                  ${detailPreview ? `<div class="rule-detail-preview mt-2">${detailPreview}</div>` : ""}
                </div>
              </div>
              <div class="rule-meta d-flex flex-wrap justify-content-between align-items-center gap-3 mt-3">
                <div class="d-flex flex-wrap align-items-center gap-2">
                  <span class="rule-number-chip">#${escapeHtml(rule.number)}</span>
                  ${
                    optionText
                      ? `<span class="rule-option text-muted small"><i class="bi bi-sliders me-1"></i>${escapeHtml(
                          optionText
                        )}</span>`
                      : ""
                  }
                </div>
                ${buildRuleActionButtons(chain.name, rule.number)}
              </div>
              <div class="rule-collapse mt-3">
                <button
                  class="btn btn-link btn-sm ps-0 rule-collapse-toggle"
                  type="button"
                  data-bs-toggle="collapse"
                  data-bs-target="#${collapseId}"
                  aria-expanded="false"
                  aria-controls="${collapseId}"
                >
                  查看完整详情
                </button>
                <div class="collapse" id="${collapseId}">
                  <div class="rule-detail-panel mt-3">
                    ${
                      fullDetails ||
                      '<div class="text-muted small">无更多详情</div>'
                    }
                    ${rawText ? `<div class="rule-raw mt-3">${rawText}</div>` : ""}
                  </div>
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <section class="chain-card card shadow-sm">
          <div class="card-body">
            <div class="chain-card-header d-flex flex-wrap justify-content-between align-items-center gap-3">
              <div>
                <h3 class="h5 mb-1">
                  <span class="chain-badge" data-chain="${escapeHtml(chain.name)}">${escapeHtml(
                    chain.name
                  )}</span>
                </h3>
                <div class="chain-meta text-muted small d-flex flex-wrap gap-3">
                  ${metaItems.join("")}
                </div>
              </div>
            </div>
            <div class="rule-card-list vstack gap-3 mt-3">
              ${rulesMarkup || '<div class="text-muted small">暂无规则。</div>'}
            </div>
          </div>
        </section>
      `;
    })
    .join("");
}

function renderTargetView(chains) {
  const targetMap = new Map();
  chains.forEach((chain) => {
    (chain.rules || []).forEach((rule) => {
      if (!targetMap.has(rule.target)) {
        targetMap.set(rule.target, []);
      }
      targetMap.get(rule.target).push({ chain, rule });
    });
  });

  if (targetMap.size === 0) {
    rulesContainer.innerHTML = `
      <div class="text-center text-muted py-5">
        <p class="mb-0">没有符合条件的规则。</p>
      </div>`;
    return;
  }

  const sections = Array.from(targetMap.entries())
    .map(([target, entries]) => {
      const visual = getTargetVisual(target);
      const cards = entries
        .map(({ chain, rule }) => {
          const protocolLabel = (rule.protocol || "ALL").toUpperCase();
          const sourcePort = getPortValue(rule, "source");
          const destinationPort = getPortValue(rule, "destination");
          const portSummary = buildPortSummary(sourcePort, destinationPort);
          const detailPreview = createDetailBadges(rule.details, 3);
          const optionText = rule.option && rule.option !== "--" ? rule.option : "";

          return `
            <div class="col">
              <div class="target-rule-card card h-100 card-subtle">
                <div class="card-body d-flex flex-column gap-3">
                  <div class="d-flex justify-content-between align-items-start gap-3">
                    <div>
                      <div class="d-flex flex-wrap align-items-center gap-2">
                        <span class="chain-badge" data-chain="${escapeHtml(chain.name)}">${escapeHtml(
                          chain.name
                        )}</span>
                        <span class="rule-number-chip">#${escapeHtml(rule.number)}</span>
                      </div>
                      <div class="rule-protocol-chip mt-2">
                        <i class="bi bi-diagram-3 me-1"></i>${escapeHtml(protocolLabel)}
                      </div>
                    </div>
                    <div class="target-card-actions">
                      ${buildRuleActionButtons(chain.name, rule.number)}
                    </div>
                  </div>
                  <div class="rule-address-block text-muted small d-flex flex-column gap-1">
                    <div>
                      <i class="bi bi-arrow-up-right-circle me-1 text-primary"></i>源：
                      <span class="text-body-secondary">${escapeHtml(rule.source || "任意")}</span>
                    </div>
                    <div>
                      <i class="bi bi-arrow-down-left-circle me-1 text-primary"></i>目的：
                      <span class="text-body-secondary">${escapeHtml(rule.destination || "任意")}</span>
                    </div>
                  </div>
                  <div class="rule-port-summary text-muted small">
                    <i class="bi bi-plug me-1"></i>${portSummary}
                  </div>
                  ${
                    optionText
                      ? `<div class="rule-option text-muted small"><i class="bi bi-sliders me-1"></i>${escapeHtml(
                          optionText
                        )}</div>`
                      : ""
                  }
                  ${detailPreview ? `<div class="rule-detail-preview">${detailPreview}</div>` : ""}
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      return `
        <section class="target-group">
          <div class="target-group-header d-flex flex-wrap align-items-center gap-3">
            <span class="${visual.badgeClass}">
              <i class="bi ${visual.icon} me-1"></i>${escapeHtml(target)}
            </span>
            <span class="text-muted small">共 ${entries.length} 条规则</span>
          </div>
          <div class="row row-cols-1 row-cols-md-2 row-cols-xl-3 g-3 mt-2">
            ${cards || '<div class="col"><div class="card-subtle text-muted small p-3">暂无规则</div></div>'}
          </div>
        </section>
      `;
    })
    .join("");

  rulesContainer.innerHTML = sections;
}

function render() {
  const chains = filterChains();
  if (state.viewMode === "chain") {
    renderChainView(chains);
  } else {
    renderTargetView(chains);
  }
}

refreshButton.addEventListener("click", fetchRules);
if (ruleModalForm) {
  ruleModalForm.addEventListener("submit", handleRuleModalSubmit);
}
viewChains.addEventListener("change", () => {
  if (viewChains.checked) {
    state.viewMode = "chain";
    render();
  }
});
viewTargets.addEventListener("change", () => {
  if (viewTargets.checked) {
    state.viewMode = "target";
    render();
  }
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});

rulesContainer.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) {
    return;
  }
  const action = button.dataset.action;
  const chain = button.dataset.chain;
  const number = button.dataset.number;

  if (action === "delete") {
    confirmAndDelete(chain, Number(number));
  } else if (action === "edit") {
    handleEditRule(chain, Number(number));
  } else if (action === "refresh") {
    fetchRules();
  }
});

fetchRules();
