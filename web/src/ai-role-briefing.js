import { normalizeRoleSignature } from "./role-duo-validation.js";

export const buildAiRoleBriefingIndex = (payload) =>
  (payload?.briefings ?? []).reduce((index, briefing) => {
    [
      briefing.signatureKey,
      briefing.roleSignature,
      normalizeRoleSignature(briefing.signatureKey),
      normalizeRoleSignature(briefing.roleSignature),
    ].forEach((key) => {
      if (key) {
        index.set(key, briefing);
      }
    });

    return index;
  }, new Map());

const renderEmptyState = (mount, escapeHtml) => {
  mount.innerHTML = `
    <div class="panel-heading">
      <span class="heading-mark"></span>
      <h2>AI 브리핑</h2>
    </div>
    <div class="empty-state">${escapeHtml("선택 역할 조합의 사전 생성 브리핑이 없음")}</div>
  `;
};

export const renderAiRoleBriefingPanel = ({ mount, role, briefingByRole, meta, tools }) => {
  const roleKey = normalizeRoleSignature(role?.primary_signature);
  const briefing = briefingByRole.get(roleKey);

  if (!briefing) {
    renderEmptyState(mount, tools.escapeHtml);
    return;
  }

  mount.innerHTML = `
    <div class="panel-heading ai-heading">
      <div>
        <span class="heading-mark"></span>
      </div>
      <div>
        <h2>AI 브리핑</h2>
        <p>선택 조합의 수치와 ML 보정값을 보고서 문장으로 변환</p>
      </div>
      <span class="ai-mode-badge">${tools.escapeHtml(meta?.mode ?? "offline")}</span>
    </div>

    <article class="ai-briefing-card">
      <div class="ai-briefing-main">
        <span>자동 요약</span>
        <h3>${tools.escapeHtml(briefing.title)}</h3>
        <p>${tools.escapeHtml(briefing.summary)}</p>
      </div>
      <div class="ai-briefing-evidence">
        <h4>핵심 근거</h4>
        <ul>
          ${(briefing.bullets ?? []).slice(0, 4).map((item) => `<li>${tools.escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
      <div class="ai-report-block">
        <h4>보고서 문장</h4>
        <p>${tools.escapeHtml(briefing.reportParagraph)}</p>
      </div>
      <div class="ai-caution">
        <strong>해석 주의</strong>
        <span>${tools.escapeHtml(briefing.caution)}</span>
      </div>
    </article>
  `;
};
