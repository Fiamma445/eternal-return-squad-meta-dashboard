import { normalizeRoleSignature } from "./role-duo-validation.js";

const toneClass = (tone) => {
  if (tone === "positive") return "is-positive";
  if (tone === "negative") return "is-negative";
  return "is-neutral";
};

export const buildMlRoleAdjustmentIndex = (payload) =>
  new Map((payload?.groups ?? []).map((group) => [normalizeRoleSignature(group.signatureKey), group]));

const signedPoint = (value) => {
  const number = Number(value);
  const safeNumber = Number.isFinite(number) ? number : 0;
  const sign = safeNumber > 0 ? "+" : "";
  return `${sign}${safeNumber.toFixed(2)}%p`;
};

const renderSignalPill = (signal, escapeHtml) => `
  <span class="ml-signal-pill ${toneClass(signal?.tone)}">${escapeHtml(signal?.label ?? "기대 수준")}</span>
`;

const formatSignature = (value) => String(value ?? "").replaceAll("|", " | ");

const renderMetric = ({ label, value, meta, className = "" }, tools) => `
  <article class="ml-metric ${className}">
    <span>${tools.escapeHtml(label)}</span>
    <strong>${tools.escapeHtml(value)}</strong>
    <small>${tools.escapeHtml(meta)}</small>
  </article>
`;

const renderLeaderRow = (row, tools) => `
  <article class="ml-leader-row">
    <div>
      <strong>${tools.escapeHtml(formatSignature(row.roleSignature))}</strong>
      <span>표본 ${tools.formatCount(row.teamCount)} · 기대 ${tools.formatPercent(row.expectedTop3Rate)}</span>
    </div>
    <em class="${toneClass(row.signal?.tone)}">${signedPoint(row.adjustedDiffPp)}</em>
  </article>
`;

const renderEmptyState = (mount, escapeHtml) => {
  mount.innerHTML = `
    <div class="panel-heading">
      <span class="heading-mark"></span>
      <h2>ML 실력 보정 조합 신호</h2>
    </div>
    <div class="empty-state">${escapeHtml("선택 역할 조합의 ML 보정 데이터가 없음")}</div>
  `;
};

export const renderMlRoleAdjustmentPanel = ({ mount, role, adjustmentByRole, topOver, topUnder, summary, metrics, tools }) => {
  const roleKey = normalizeRoleSignature(role?.primary_signature);
  const adjustment = adjustmentByRole.get(roleKey);

  if (!adjustment) {
    renderEmptyState(mount, tools.escapeHtml);
    return;
  }

  mount.innerHTML = `
    <div class="panel-heading ml-heading">
      <div>
        <span class="heading-mark"></span>
      </div>
      <div>
        <h2>ML 실력 보정 조합 신호</h2>
        <p>경기 전 강도 기대값과 실제 Top3율의 차이</p>
      </div>
      <div class="ml-model-badge">
        <span>ROC-AUC ${tools.formatDecimal(metrics?.roc_auc, 3)}</span>
        <span>4.0 표본 ${tools.formatCount(summary?.test_rows)}</span>
      </div>
    </div>

    <div class="ml-adjustment-grid">
      <article class="ml-selected-card">
        <div class="ml-selected-head">
          <div>
            <span>선택 조합</span>
            <strong>${tools.escapeHtml(formatSignature(adjustment.roleSignature))}</strong>
          </div>
          ${renderSignalPill(adjustment.signal, tools.escapeHtml)}
        </div>
        <div class="ml-metric-grid">
          ${renderMetric(
            {
              label: "실제 Top3",
              value: tools.formatPercent(adjustment.actualTop3Rate),
              meta: `실제 ${tools.formatCount(adjustment.actualTop3Count)}팀`,
            },
            tools,
          )}
          ${renderMetric(
            {
              label: "기대 Top3",
              value: tools.formatPercent(adjustment.expectedTop3Rate),
              meta: "rankPoint/MMR 보정",
            },
            tools,
          )}
          ${renderMetric(
            {
              label: "보정 차이",
              value: signedPoint(adjustment.adjustedDiffPp),
              meta: `우세 순위 ${tools.formatCount(adjustment.overRank)}위`,
              className: toneClass(adjustment.signal?.tone),
            },
            tools,
          )}
          ${renderMetric(
            {
              label: "보정 lift",
              value: tools.formatMultiplier(adjustment.adjustedLift),
              meta: adjustment.confidence?.label ?? "표본 주의",
            },
            tools,
          )}
        </div>
      </article>

      <div class="ml-leaderboards">
        <section>
          <h3>실력 대비 우세</h3>
          <div class="ml-leader-list">
            ${(topOver ?? []).slice(0, 4).map((row) => renderLeaderRow(row, tools)).join("")}
          </div>
        </section>
        <section>
          <h3>실력 대비 열세</h3>
          <div class="ml-leader-list">
            ${(topUnder ?? []).slice(0, 4).map((row) => renderLeaderRow(row, tools)).join("")}
          </div>
        </section>
      </div>
    </div>
  `;
};
