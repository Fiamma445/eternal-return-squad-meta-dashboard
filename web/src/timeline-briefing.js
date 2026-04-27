const toNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
};

const isNil = (value) => value === null || value === undefined || Number.isNaN(value);

const formatPercent = (value) => (isNil(value) ? "-" : `${toNumber(value).toFixed(2)}%`);

const formatSignedPp = (value) => {
  if (isNil(value)) {
    return "-";
  }

  const number = toNumber(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}%p`;
};

const deltaClass = (value) => {
  if (isNil(value) || toNumber(value) === 0) {
    return "is-neutral";
  }

  return toNumber(value) > 0 ? "is-positive" : "is-negative";
};

const currentShare = (row) => row?.versions?.["4.0"]?.sharePct;

const currentTop3 = (row) => row?.versions?.["4.0"]?.top3Rate;

const renderBriefingList = (items, tools) =>
  (items ?? [])
    .slice(0, 4)
    .map(
      (item) => `
        <article class="timeline-leader-row">
          <div>
            <strong>${tools.escapeHtml(item.name)}</strong>
            <span>${tools.escapeHtml(item.label ?? "변화")} · 4.0 점유 ${formatPercent(currentShare(item))} · Top3 ${formatPercent(currentTop3(item))}</span>
          </div>
          <em class="${deltaClass(item.deltaSharePp)}">${formatSignedPp(item.deltaSharePp)}</em>
        </article>
      `,
    )
    .join("");

const renderSelectedBriefing = ({ selected, briefing, tools }) => {
  if (!briefing) {
    return `
      <section class="timeline-briefing-card timeline-selected-card">
        <span>선택 캐릭터 브리핑</span>
        <h3>${tools.escapeHtml(selected?.name ?? "선택 없음")}</h3>
        <p>선택한 캐릭터의 패치 브리핑 데이터가 없음</p>
      </section>
    `;
  }

  return `
    <section class="timeline-briefing-card timeline-selected-card">
      <span>선택 캐릭터 브리핑</span>
      <h3>${tools.escapeHtml(briefing.title)}</h3>
      <p>${tools.escapeHtml(briefing.summary)}</p>
      <ul>
        ${(briefing.bullets ?? []).map((bullet) => `<li>${tools.escapeHtml(bullet)}</li>`).join("")}
      </ul>
    </section>
  `;
};

const renderLeaderSection = (title, items, tools) => `
  <section class="timeline-leader-card">
    <h3>${tools.escapeHtml(title)}</h3>
    <div class="timeline-leader-list">${renderBriefingList(items, tools)}</div>
  </section>
`;

const renderBriefingGrid = ({ selected, selectedBriefing, payload, overview, tools }) => `
  <div class="timeline-briefing-grid">
    <section class="timeline-briefing-card timeline-overview-card">
      <span>전체 요약</span>
      <h3>${tools.escapeHtml(overview.title)}</h3>
      <p>${tools.escapeHtml(overview.summary)}</p>
      <div class="timeline-report-line">${tools.escapeHtml(overview.reportParagraph)}</div>
    </section>

    ${renderSelectedBriefing({ selected, briefing: selectedBriefing, tools })}
    ${renderLeaderSection("상승 역할 조합", payload.roleShifts?.topRising ?? [], tools)}
    ${renderLeaderSection("하락 역할 조합", payload.roleShifts?.topFalling ?? [], tools)}
    ${renderLeaderSection("상승 듀오", payload.duoShifts?.topRising ?? [], tools)}
    ${renderLeaderSection("상승 캐릭터", payload.characterShifts?.topRising ?? [], tools)}
  </div>
`;

export const buildTimelineBriefingIndex = (payload) =>
  new Map((payload?.characterBriefings ?? []).map((briefing) => [String(briefing.characterCode), briefing]));

export const renderTimelineBriefingPanel = ({ mount, selected, payload, briefingByCode, tools }) => {
  const overview = payload?.overview;

  if (!mount || !overview) {
    if (mount) {
      mount.innerHTML = `<div class="empty-state">패치 메타 브리핑 데이터가 없음</div>`;
    }
    return;
  }

  const selectedBriefing = briefingByCode.get(String(selected?.code ?? ""));

  mount.innerHTML = `
    <div class="panel-heading timeline-briefing-heading">
      <div>
        <span class="heading-mark"></span>
        <h2>AI 패치 메타 브리핑</h2>
        <p>캐릭터, 역할 조합, 듀오의 4.0 vs 3.0 변화 신호를 사전 생성 JSON으로 요약</p>
      </div>
      <span class="timeline-mode-badge">${tools.escapeHtml(payload.mode ?? "offline_static")}</span>
    </div>

    ${renderBriefingGrid({ selected, selectedBriefing, payload, overview, tools })}

    <div class="timeline-briefing-caution">
      <strong>해석 주의</strong>
      <span>${tools.escapeHtml(overview.caution ?? "표본 차이를 고려해 방향성 중심으로 해석")}</span>
    </div>
  `;
};
