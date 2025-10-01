const state = {
  chains: [],
  viewMode: "chain",
  search: "",
  loading: false,
};

const rulesContainer = document.getElementById("rulesContainer");
const errorAlert = document.getElementById("errorAlert");
const refreshButton = document.getElementById("refreshButton");
const addRuleForm = document.getElementById("addRuleForm");
const searchInput = document.getElementById("searchInput");
const viewChains = document.getElementById("viewChains");
const viewTargets = document.getElementById("viewTargets");

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

function handleAddRule(event) {
  event.preventDefault();
  const formData = new FormData(addRuleForm);
  const payload = {
    chain: formData.get("chain").trim(),
    specification: formData.get("specification").trim(),
  };
  const position = formData.get("position");
  if (position) {
    payload.position = Number(position);
  }

  fetch("/api/rules", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "添加规则失败");
      }
      addRuleForm.reset();
      fetchRules();
    })
    .catch((error) => {
      showError(error.message);
    });
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

function editRule(chain, number) {
  const specification = prompt(
    `请输入替换 ${chain} 链第 ${number} 条规则的参数片段：`
  );
  if (!specification) {
    return;
  }
  fetch(`/api/rules/${encodeURIComponent(chain)}/${number}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ specification }),
  })
    .then(async (response) => {
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "更新规则失败");
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

function createDetailBadges(details) {
  if (!details || details.length === 0) {
    return "";
  }
  return `
    <div class="d-flex flex-wrap gap-2">
      ${details
        .map((detail) => {
          const value = detail.value ? `<span>${detail.value}</span>` : "";
          return `<span class="rule-detail-badge">${detail.label}${value}</span>`;
        })
        .join("")}
    </div>
  `;
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
      const headerMeta = [
        chain.policy ? `策略：<strong>${chain.policy}</strong>` : null,
        typeof chain.references === "number"
          ? `引用：<strong>${chain.references}</strong>`
          : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const rows = chain.rules
        .map(
          (rule) => `
            <tr>
              <td class="fw-semibold">${rule.number}</td>
              <td>${rule.target}</td>
              <td>${rule.protocol}</td>
              <td>${rule.option}</td>
              <td>${rule.source}</td>
              <td>${rule.destination}</td>
              <td>${createDetailBadges(rule.details)}</td>
              <td class="rule-actions text-end">
                <button class="btn btn-sm btn-outline-secondary me-2" data-action="edit" data-chain="${chain.name}" data-number="${rule.number}">编辑</button>
                <button class="btn btn-sm btn-outline-danger" data-action="delete" data-chain="${chain.name}" data-number="${rule.number}">删除</button>
              </td>
            </tr>
          `
        )
        .join("");

      return `
        <div class="card shadow-sm">
          <div class="card-header d-flex justify-content-between align-items-center bg-white">
            <div>
              <h2 class="h5 mb-1">
                ${chain.name}
                <span class="chain-badge" data-chain="${chain.name}">${chain.name}</span>
              </h2>
              <div class="text-muted small">${headerMeta || ""}</div>
            </div>
            <button class="btn btn-sm btn-outline-primary" data-action="refresh">刷新此链</button>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-hover mb-0 align-middle">
                <thead>
                  <tr>
                    <th style="width: 60px">#</th>
                    <th>目标</th>
                    <th>协议</th>
                    <th>选项</th>
                    <th>源地址</th>
                    <th>目的地址</th>
                    <th>详细信息</th>
                    <th style="width: 180px" class="text-end">操作</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTargetView(chains) {
  const targetMap = new Map();
  chains.forEach((chain) => {
    chain.rules.forEach((rule) => {
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
      const items = entries
        .map(({ chain, rule }) => `
          <div class="card shadow-sm mb-3">
            <div class="card-body">
              <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
                <div>
                  <h4 class="h6 mb-1">链：<span class="chain-badge" data-chain="${chain.name}">${chain.name}</span></h4>
                  <div class="text-muted small">规则编号：${rule.number}</div>
                </div>
                <div class="rule-actions">
                  <button class="btn btn-sm btn-outline-secondary me-2" data-action="edit" data-chain="${chain.name}" data-number="${rule.number}">编辑</button>
                  <button class="btn btn-sm btn-outline-danger" data-action="delete" data-chain="${chain.name}" data-number="${rule.number}">删除</button>
                </div>
              </div>
              <div class="mt-3">
                <div class="fw-semibold">源地址：${rule.source}</div>
                <div class="fw-semibold">目的地址：${rule.destination}</div>
                <div class="text-muted mt-2">协议：${rule.protocol}｜选项：${rule.option}</div>
              </div>
              <div class="mt-3">${createDetailBadges(rule.details)}</div>
            </div>
          </div>
        `)
        .join("");

      return `
        <section class="target-section">
          <h3 class="mb-3">目标：${target}</h3>
          ${items}
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
addRuleForm.addEventListener("submit", handleAddRule);
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
    editRule(chain, Number(number));
  } else if (action === "refresh") {
    fetchRules();
  }
});

fetchRules();
