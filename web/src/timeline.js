import { renderTimelineBriefingPanel } from "./timeline-briefing.js";

const VERSION_ORDER = ["2.0", "3.0", "4.0"];

const VERSION_COLORS = {
  "2.0": "#f1c48a",
  "3.0": "#9db7ff",
  "4.0": "#45e0d0",
};

const isBlank = (value) => String(value ?? "").trim().length === 0;

const formatMaybePercent = (value, tools) => (isBlank(value) ? "-" : tools.formatPercent(value));

const formatMaybePointDiff = (value, tools, emptyText = "-") => (isBlank(value) ? emptyText : tools.formatPointDiff(value));

const formatMaybeRankDiff = (value, tools) => {
  if (isBlank(value)) {
    return "-";
  }

  const sign = tools.toNumber(value) > 0 ? "+" : "";
  return `${sign}${tools.formatRank(value)}`;
};

const deltaClass = (value, tools, lowerIsBetter = false) => {
  if (isBlank(value)) {
    return "";
  }

  const number = tools.toNumber(value);

  if (number === 0) {
    return "";
  }

  const good = lowerIsBetter ? number < 0 : number > 0;
  return good ? "is-good" : "is-bad";
};

const sortByVersion = (left, right) => VERSION_ORDER.indexOf(left.version) - VERSION_ORDER.indexOf(right.version);

export const aggregateVersionCompare = (rows, toNumber) =>
  rows
    .map((row) => ({
      code: row.character_code,
      name: row.character_name,
      pickShare2: row["pick_share_2.0"],
      pickShare3: row["pick_share_3.0"],
      pickShare4: row["pick_share_4.0"],
      top3Rate2: row["top3_rate_2.0"],
      top3Rate3: row["top3_rate_3.0"],
      top3Rate4: row["top3_rate_4.0"],
      winRate4: row["win_rate_4.0"],
      avgRank4: row["avg_rank_4.0"],
      delta4Vs2: row.delta_4_vs_2,
      delta4Vs3: row.delta_4_vs_3,
      deltaTop3Vs3: row.delta_top3_4_vs_3,
      deltaWinVs3: row.delta_win_4_vs_3,
      deltaRankVs3: row.delta_rank_4_vs_3,
      metaShift: row.meta_shift_refined || row.meta_shift_type || "분류 없음",
      patchImpact: row.patch_impact_type || "패치 맥락 없음",
      sortValue: Math.abs(toNumber(row.delta_4_vs_3 || row.delta_4_vs_2)),
    }))
    .sort((left, right) => right.sortValue - left.sortValue || left.name.localeCompare(right.name, "ko"));

export const aggregateVersionSummary = (rows, toNumber) =>
  VERSION_ORDER.map((version) => {
    const versionRows = rows.filter((row) => row.version === version);
    const byDate = new Map(versionRows.map((row) => [row.play_date, row]));
    const dates = [...byDate.keys()].sort();
    const totalTeams = [...byDate.values()].reduce((total, row) => total + toNumber(row.total_teams), 0);
    const totalSlots = [...byDate.values()].reduce((total, row) => total + toNumber(row.total_slots), 0);

    return {
      version,
      dateCount: dates.length,
      dateMin: dates[0] ?? "-",
      dateMax: dates[dates.length - 1] ?? "-",
      totalTeams,
      totalSlots,
    };
  });

const getSelectedVersionCharacter = (state) =>
  state.versionCompare.find((character) => character.code === state.selectedTimelineCode) ?? state.versionCompare[0];

const getTimelineRows = (state, selected, tools) =>
  state.characterDailyRows
    .filter((row) => row.character_code === selected?.code)
    .map((row) => ({
      date: row.play_date,
      version: row.version,
      pickShare: tools.toNumber(row.pick_share),
      top3Rate: row.top3_rate,
      teamCount: row.team_count,
    }))
    .sort((left, right) => `${left.date}|${left.version}`.localeCompare(`${right.date}|${right.version}`));

const sumRows = (rows, key, tools) => rows.reduce((total, row) => total + tools.toNumber(row[key]), 0);

const weightedAverage = (rows, valueKey, weightKey, tools) => {
  const weightTotal = sumRows(rows, weightKey, tools);

  if (weightTotal === 0) {
    return null;
  }

  return rows.reduce((total, row) => total + tools.toNumber(row[valueKey]) * tools.toNumber(row[weightKey]), 0) / weightTotal;
};

const getCharacterVersionStats = (state, selected, tools) => {
  if (!selected) {
    return new Map();
  }

  return new Map(
    VERSION_ORDER.map((version) => {
      const summary = state.versionSummary.find((item) => item.version === version) ?? {};
      const rows = state.characterDailyRows.filter((row) => row.character_code === selected.code && row.version === version);
      const pickCount = sumRows(rows, "pick_count", tools);
      const teamCount = sumRows(rows, "team_count", tools);

      return [
        version,
        {
          version,
          hasData: teamCount > 0,
          pickShare: summary.totalSlots > 0 ? (pickCount / summary.totalSlots) * 100 : null,
          top3Rate: weightedAverage(rows, "top3_rate", "team_count", tools),
          winRate: weightedAverage(rows, "win_rate", "team_count", tools),
          avgRank: weightedAverage(rows, "avg_rank", "team_count", tools),
        },
      ];
    }),
  );
};

const getVersionDiff = (versionStats, currentVersion, previousVersion, key) => {
  const current = versionStats.get(currentVersion);
  const previous = versionStats.get(previousVersion);

  if (!current?.hasData || !previous?.hasData) {
    return null;
  }

  return current[key] - previous[key];
};

const formatTimelinePickDelta = (versionStats, tools) => {
  const current = versionStats.get("4.0");
  const previous = versionStats.get("3.0");

  if (current?.hasData && !previous?.hasData) {
    return "신규";
  }

  return formatMaybePointDiff(getVersionDiff(versionStats, "4.0", "3.0", "pickShare"), tools, "-");
};

const renderTimelineList = ({ state, tools, rerender }) => {
  const selected = getSelectedVersionCharacter(state);
  const list = document.querySelector("#timelineList");

  if (!list) {
    return;
  }

  list.innerHTML = state.versionCompare
    .slice(0, 30)
    .map((character) => {
      const activeClass = character.code === selected?.code ? " is-active" : "";
      const versionStats = getCharacterVersionStats(state, character, tools);

      return `
        <button class="ranking-button character-button${activeClass}" type="button" data-code="${tools.escapeHtml(character.code)}">
          ${tools.renderCharacterIcon(character, "character-avatar", { decorative: true })}
          <span class="character-row-copy">
            <span class="ranking-title">${tools.escapeHtml(character.name)}</span>
            <span class="character-build">${tools.escapeHtml(character.metaShift)}</span>
            <span class="ranking-meta">
              <span>4.0 vs 3.0 ${tools.escapeHtml(formatTimelinePickDelta(versionStats, tools))}</span>
              <span>${tools.escapeHtml(character.patchImpact)}</span>
            </span>
          </span>
        </button>
      `;
    })
    .join("");

  tools.bindCharacterIconFallbacks(list);

  list.querySelectorAll(".ranking-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedTimelineCode = button.dataset.code;
      rerender();
    });
  });
};

const renderTimelineKpis = ({ versionStats, tools }) => {
  const pickDiff = getVersionDiff(versionStats, "4.0", "3.0", "pickShare");
  const top3Diff = getVersionDiff(versionStats, "4.0", "3.0", "top3Rate");

  tools.renderKpiCards("#timelineKpiGrid", [
    { label: "2.0 픽 점유", value: formatMaybePercent(versionStats.get("2.0")?.pickShare, tools), delta: "패치 2.0" },
    { label: "3.0 픽 점유", value: formatMaybePercent(versionStats.get("3.0")?.pickShare, tools), delta: "패치 3.0" },
    { label: "4.0 픽 점유", value: formatMaybePercent(versionStats.get("4.0")?.pickShare, tools), delta: "패치 4.0" },
    {
      label: "4.0 vs 3.0",
      value: formatTimelinePickDelta(versionStats, tools),
      delta: "픽 점유 변화",
      className: deltaClass(pickDiff, tools),
    },
    {
      label: "4.0 Top3율",
      value: formatMaybePercent(versionStats.get("4.0")?.top3Rate, tools),
      delta: `Top3 변화 ${formatMaybePointDiff(top3Diff, tools, "-")}`,
      className: deltaClass(top3Diff, tools),
    },
  ]);
};

const renderTimelineDetail = ({ selected, versionStats, tools }) => {
  const panel = document.querySelector("#timelineDetailPanel");
  const version4 = versionStats.get("4.0") ?? {};
  const winDiff = getVersionDiff(versionStats, "4.0", "3.0", "winRate");
  const rankDiff = getVersionDiff(versionStats, "4.0", "3.0", "avgRank");

  if (!panel || !selected) {
    return;
  }

  panel.innerHTML = `
    <div class="character-identity">
      ${tools.renderCharacterIcon(selected, "character-emblem")}
      <div>
        <p class="detail-kicker">선택 캐릭터 버전 흐름</p>
        <h2 class="detail-title">${tools.escapeHtml(selected.name)}</h2>
        <p class="detail-copy">패치 2.0 / 3.0 / 4.0 균형 비교와 일자별 픽 점유 흐름</p>
        <div class="chip-row">
          <span class="info-chip">${tools.escapeHtml(selected.metaShift)}</span>
          <span class="info-chip">${tools.escapeHtml(selected.patchImpact)}</span>
        </div>
      </div>
    </div>
    <div class="detail-facts character-detail-facts">
      <article class="fact-card">
        <div class="fact-label">승률 변화</div>
        <div class="fact-value">${tools.escapeHtml(formatMaybePointDiff(winDiff, tools, "-"))}</div>
      </article>
      <article class="fact-card">
        <div class="fact-label">평균순위 변화</div>
        <div class="fact-value">${tools.escapeHtml(formatMaybeRankDiff(rankDiff, tools))}</div>
      </article>
      <article class="fact-card">
        <div class="fact-label">4.0 성과</div>
        <div class="fact-value">${tools.escapeHtml(`승률 ${formatMaybePercent(version4.winRate, tools)} · 평균순위 ${isBlank(version4.avgRank) ? "-" : tools.formatRank(version4.avgRank)}`)}</div>
      </article>
    </div>
  `;

  tools.bindCharacterIconFallbacks(panel);
};

const buildSvgPoint = (point, index, x, y, tools) => `
  <circle cx="${x}" cy="${y}" r="5" fill="${VERSION_COLORS[point.version] ?? VERSION_COLORS["4.0"]}" stroke="#151a21" stroke-width="2">
    <title>${tools.escapeHtml(`${point.date} / ${point.version} / 픽 점유 ${tools.formatPercent(point.pickShare)} / Top3 ${formatMaybePercent(point.top3Rate, tools)}`)}</title>
  </circle>
  ${index === 0 ? `<text x="${x}" y="${y - 12}" text-anchor="middle" class="timeline-point-label">${tools.escapeHtml(tools.formatPercent(point.pickShare))}</text>` : ""}
`;

const renderTimelineChart = ({ state, selected, tools }) => {
  const mount = document.querySelector("#timelineChart");

  if (!mount || !selected) {
    return;
  }

  const rows = getTimelineRows(state, selected, tools);

  if (rows.length === 0) {
    mount.innerHTML = `<div class="empty-state">선택 캐릭터의 일자별 시계열 데이터가 없음</div>`;
    return;
  }

  const width = 960;
  const height = 320;
  const padding = { top: 34, right: 26, bottom: 60, left: 58 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...rows.map((row) => row.pickShare), 1);
  const niceMax = Math.ceil(maxValue * 1.15 * 10) / 10;
  const xFor = (index) => padding.left + (rows.length === 1 ? plotWidth / 2 : (plotWidth / (rows.length - 1)) * index);
  const yFor = (value) => padding.top + plotHeight - (value / niceMax) * plotHeight;
  const polyline = rows.map((row, index) => `${xFor(index)},${yFor(row.pickShare)}`).join(" ");
  const labelStep = Math.max(Math.ceil(rows.length / 6), 1);
  const axisLabels = rows
    .map((row, index) => ({ row, index }))
    .filter(({ index }) => index % labelStep === 0 || index === rows.length - 1)
    .map(({ row, index }) => `
      <text x="${xFor(index)}" y="${height - 26}" text-anchor="middle" class="timeline-axis-label">${tools.escapeHtml(row.date.slice(5))}</text>
      <text x="${xFor(index)}" y="${height - 11}" text-anchor="middle" class="timeline-axis-label muted">${tools.escapeHtml(row.version)}</text>
    `)
    .join("");
  const grid = [0, niceMax / 2, niceMax]
    .map((value) => `
      <line x1="${padding.left}" y1="${yFor(value)}" x2="${width - padding.right}" y2="${yFor(value)}" class="timeline-grid-line" />
      <text x="${padding.left - 10}" y="${yFor(value) + 4}" text-anchor="end" class="timeline-axis-label">${tools.escapeHtml(`${value.toFixed(1)}%`)}</text>
    `)
    .join("");
  const pointSvg = rows
    .map((row, index) => buildSvgPoint(row, index, xFor(index), yFor(row.pickShare), tools))
    .join("");
  const summary = state.versionSummary
    .slice()
    .sort(sortByVersion)
    .map(
      (version) => `
        <span class="version-pill" style="--version-color: ${VERSION_COLORS[version.version] ?? VERSION_COLORS["4.0"]}">
          ${tools.escapeHtml(`${version.version} · ${version.dateMin.slice(5)}~${version.dateMax.slice(5)} · ${tools.formatCount(version.totalTeams)}팀`)}
        </span>
      `,
    )
    .join("");

  mount.innerHTML = `
    <svg class="timeline-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${tools.escapeHtml(`${selected.name} 일자별 픽 점유율`)}">
      ${grid}
      <polyline points="${polyline}" class="timeline-line" />
      ${pointSvg}
      ${axisLabels}
    </svg>
    <div class="timeline-legend">${summary}</div>
  `;
};

const renderTimelineBriefing = ({ state, selected, tools }) => {
  renderTimelineBriefingPanel({
    mount: document.querySelector("#timelineBriefing"),
    selected,
    payload: state.timelineBriefing,
    briefingByCode: state.timelineCharacterBriefings,
    tools,
  });
};

export const renderTimelineDashboard = ({ state, tools }) => {
  const selected = getSelectedVersionCharacter(state);
  const versionStats = getCharacterVersionStats(state, selected, tools);
  const rerender = () => renderTimelineDashboard({ state, tools });

  renderTimelineList({ state, tools, rerender });
  renderTimelineKpis({ versionStats, tools });
  renderTimelineDetail({ selected, versionStats, tools });
  renderTimelineBriefing({ state, selected, tools });
  renderTimelineChart({ state, selected, tools });
};
