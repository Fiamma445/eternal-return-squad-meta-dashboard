const CONFIDENCE_CLASS = {
  high: "is-high",
  medium: "is-medium",
  low: "is-low",
};

export const normalizeRoleSignature = (value) =>
  String(value ?? "")
    .replace(/^역할 조합:\s*/, "")
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right, "ko"))
    .join("|");

export const buildRoleDuoValidationIndex = (payload) =>
  new Map((payload?.roles ?? []).map((role) => [normalizeRoleSignature(role.signatureKey), role]));

const confidenceClass = (confidence) => CONFIDENCE_CLASS[confidence?.level] ?? "is-low";

const renderConfidence = (confidence, escapeHtml) => `
  <span class="confidence-pill ${confidenceClass(confidence)}">${escapeHtml(confidence?.label ?? "주의")}</span>
`;

const signedPoint = (value) => {
  const number = Number(value);
  const safeNumber = Number.isFinite(number) ? number : 0;
  const sign = safeNumber > 0 ? "+" : "";
  return `${sign}${safeNumber.toFixed(2)}%p`;
};

const deltaTone = (value) => {
  if (value > 0) return "is-positive";
  if (value < 0) return "is-negative";
  return "is-neutral";
};

const renderDelta = (value, label) => `
  <span class="validation-delta ${deltaTone(value)}">${label} ${signedPoint(value)}</span>
`;

const renderDuoIcons = (duo, renderCharacterIcon) => `
  <span class="validation-duo-icons" aria-hidden="true">
    ${renderCharacterIcon(duo.first, "duo-avatar", { decorative: true })}
    ${renderCharacterIcon(duo.second, "duo-avatar", { decorative: true })}
  </span>
`;

const renderEmptyState = (mount, escapeHtml) => {
  mount.innerHTML = `
    <div class="panel-heading">
      <span class="heading-mark"></span>
      <h2>역할 조합 × 듀오 검증</h2>
    </div>
    <div class="empty-state">${escapeHtml("선택 역할 조합과 연결된 듀오 검증 데이터가 없음")}</div>
  `;
};

const renderValidationRow = (duo, validation, tools) => {
  const name = `${duo.first?.name ?? "미상"} + ${duo.second?.name ?? "미상"}`;
  const top3Diff = duo.top3Rate - validation.top3Rate;
  const winDiff = duo.winRate - validation.winRate;

  return `
    <article class="validation-row">
      <div class="validation-duo">
        ${renderDuoIcons(duo, tools.renderCharacterIcon)}
        <div>
          <strong>${tools.escapeHtml(name)}</strong>
          <span>역할 조합 내 등장률 ${tools.formatPercent(duo.shareWithinRole)}</span>
        </div>
      </div>
      <div class="validation-metric">
        <strong>${tools.formatCount(duo.count)}</strong>
        <span>표본</span>
      </div>
      <div class="validation-metric">
        <strong>${tools.formatPercent(duo.top3Rate)}</strong>
        <span>Top3</span>
        ${renderDelta(top3Diff, "역할 대비")}
      </div>
      <div class="validation-metric">
        <strong>${tools.formatPercent(duo.winRate)}</strong>
        <span>승률</span>
        ${renderDelta(winDiff, "역할 대비")}
      </div>
      <div>${renderConfidence(duo.confidence, tools.escapeHtml)}</div>
    </article>
  `;
};

export const renderRoleDuoValidationPanel = ({ mount, role, validationByRole, tools }) => {
  const roleKey = normalizeRoleSignature(role?.primary_signature);
  const validation = validationByRole.get(roleKey);

  if (!validation) {
    renderEmptyState(mount, tools.escapeHtml);
    return;
  }

  const top3BetterCount = validation.duos.filter((duo) => duo.top3Rate > validation.top3Rate).length;
  const winBetterCount = validation.duos.filter((duo) => duo.winRate > validation.winRate).length;

  mount.innerHTML = `
    <div class="panel-heading validation-heading">
      <div>
        <span class="heading-mark"></span>
      </div>
      <div>
        <h2>역할 조합 × 듀오 검증</h2>
        <p>선택 역할 조합 안의 주요 듀오가 조합 평균보다 좋은 성과를 냈는지 확인</p>
      </div>
    </div>

    <div class="validation-summary">
      <article>
        <span>검증 표본</span>
        <strong>${tools.formatCount(validation.count)}</strong>
      </article>
      <article>
        <span>표시 듀오</span>
        <strong>${tools.formatCount(validation.duos.length)}개</strong>
      </article>
      <article>
        <span>Top3 우세 듀오</span>
        <strong>${tools.formatCount(top3BetterCount)}/${tools.formatCount(validation.duos.length)}</strong>
      </article>
      <article>
        <span>승률 우세 듀오</span>
        <strong>${tools.formatCount(winBetterCount)}/${tools.formatCount(validation.duos.length)}</strong>
      </article>
    </div>

    <div class="validation-list">
      ${validation.duos.map((duo) => renderValidationRow(duo, validation, tools)).join("")}
    </div>
  `;
};
