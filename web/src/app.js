import { buildRoleDuoValidationIndex, renderRoleDuoValidationPanel } from "./role-duo-validation.js";
import { buildMlRoleAdjustmentIndex, renderMlRoleAdjustmentPanel } from "./ml-role-adjustment.js";
import { buildAiRoleBriefingIndex, renderAiRoleBriefingPanel } from "./ai-role-briefing.js";
import { aggregateVersionCompare, aggregateVersionSummary, renderTimelineDashboard } from "./timeline.js";
import { buildTimelineBriefingIndex } from "./timeline-briefing.js";

const DATA_PATHS = {
  storyFeed: "./src/data/tableau_main_story_feed_v4_0.csv",
  roleWeaponTop5: "./src/data/weapon_role_story_shortlist_drilldown_v4_0_top5.csv",
  characters: "./src/data/character_day_mart.csv",
  versionCompare: "./src/data/balanced_version_compare_labeled.csv",
  characterWeapons: "./src/data/character_weapon_mapping_manual.csv",
  characterIcons: "./src/data/character-icons.json",
  duos: "./src/data/duo_synergy_mart.csv",
  roleDuoValidation: "./src/data/role-duo-validation.json",
  mlRoleAdjustment: "./src/data/ml-role-adjustment.json",
  aiRoleBriefings: "./src/data/ai-role-briefings.json",
  timelineBriefing: "./src/data/timeline-meta-briefing.json",
};

const DUO_TOP3_MIN_TEAM_COUNT = 300;

const state = {
  activeView: "role",
  roles: [],
  weapons: [],
  characters: [],
  characterDailyRows: [],
  characterWeapons: new Map(),
  characterIcons: new Map(),
  duos: [],
  versionCompare: [],
  versionSummary: [],
  roleDuoValidation: new Map(),
  mlRoleAdjustment: new Map(),
  mlRoleAdjustmentTopOver: [],
  mlRoleAdjustmentTopUnder: [],
  mlRoleAdjustmentSummary: {},
  mlRoleAdjustmentMetrics: {},
  aiRoleBriefings: new Map(),
  aiRoleBriefingsMeta: {},
  timelineBriefing: {},
  timelineCharacterBriefings: new Map(),
  selectedOrder: null,
  selectedCharacterCode: null,
  selectedDuoKey: null,
  selectedTimelineCode: null,
};

const $ = (selector) => document.querySelector(selector);

const escapeHtml = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      row.push(cell);
      if (row.some((value) => value.length > 0)) {
        rows.push(row);
      }
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  const [headers, ...records] = rows;
  return records.map((record) =>
    Object.fromEntries(headers.map((header, index) => [header.trim(), record[index] ?? ""])),
  );
};

const loadCsv = async (path) => {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`${path} 파일을 불러오지 못했음`);
  }

  return parseCsv(await response.text());
};

const loadJson = async (path) => {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(`${path} JSON load failed`);
  }

  return response.json();
};

const toNumber = (value) => {
  const number = Number(String(value ?? "").replaceAll(",", ""));
  return Number.isFinite(number) ? number : 0;
};

const sum = (rows, key) => rows.reduce((total, row) => total + toNumber(row[key]), 0);

const weightedAverage = (rows, valueKey, weightKey) => {
  const weightTotal = sum(rows, weightKey);

  if (weightTotal === 0) {
    return 0;
  }

  return rows.reduce((total, row) => total + toNumber(row[valueKey]) * toNumber(row[weightKey]), 0) / weightTotal;
};

const uniqueTotal = (rows, valueKey) => {
  const byDateVersion = new Map();
  rows.forEach((row) => byDateVersion.set(`${row.play_date}|${row.version}`, toNumber(row[valueKey])));
  return [...byDateVersion.values()].reduce((total, value) => total + value, 0);
};

const groupBy = (rows, keyGetter) =>
  rows.reduce((groups, row) => {
    const key = keyGetter(row);
    const current = groups.get(key) ?? [];
    groups.set(key, [...current, row]);
    return groups;
  }, new Map());

const addCount = (counter, key, weight = 1) => {
  const cleanedKey = String(key ?? "").trim();

  if (cleanedKey.length === 0) {
    return;
  }

  counter.set(cleanedKey, (counter.get(cleanedKey) ?? 0) + weight);
};

const topCounterEntries = (counter, limit = 3) =>
  [...counter.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));

const formatPercent = (value) => `${toNumber(value).toFixed(2)}%`;

const formatRank = (value) => toNumber(value).toFixed(3);

const formatCount = (value) => new Intl.NumberFormat("ko-KR").format(toNumber(value));

const formatPointDiff = (value) => {
  const number = toNumber(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(2)}%p`;
};

const formatRankDiff = (value) => {
  const number = toNumber(value);
  const sign = number > 0 ? "+" : "";
  return `${sign}${number.toFixed(3)}`;
};

const formatDecimal = (value, digits = 2) => toNumber(value).toFixed(digits);

const formatMultiplier = (value) => `${toNumber(value).toFixed(2)}x`;

const cleanRoleLabel = (value) => String(value ?? "").replace(/^역할 조합:\s*/, "").replaceAll("|", " | ");

const formatStoryTag = (value) => {
  const tag = String(value ?? "");
  const replacements = new Map([
    ["메인 강세 구조", "메인 강세 조합"],
    ["메인 표준 구조", "메인 표준 조합"],
    ["고성능 니치 구조", "소수 고성능 조합"],
    ["자주 쓰이지만 약한 구조", "자주 쓰이지만 약한 조합"],
    ["보조 구조", "기타 조합"],
  ]);

  return replacements.get(tag) ?? tag.replaceAll("구조", "조합");
};

const getCharacterInitial = (name) => String(name ?? "?").trim().slice(0, 1) || "?";

const getCharacterIcon = (character) => state.characterIcons.get(String(character?.code ?? ""));

const getDuoMembers = (row) =>
  [
    { code: row.character_a_code, name: row.character_a_name },
    { code: row.character_b_code, name: row.character_b_name },
  ].sort((left, right) => String(left.name ?? "").localeCompare(String(right.name ?? ""), "ko"));

const renderCharacterIcon = (character, className, options = {}) => {
  const icon = getCharacterIcon(character);
  const name = character?.name ?? "";

  if (!icon?.iconUrl) {
    return `<span class="${className}" aria-hidden="true">${escapeHtml(getCharacterInitial(name))}</span>`;
  }

  const altText = options.decorative ? "" : `${name} 아이콘`;
  const hiddenAttr = options.decorative ? ' aria-hidden="true"' : "";

  return `
    <span class="${className} has-image"${hiddenAttr} data-fallback="${escapeHtml(getCharacterInitial(name))}">
      <img src="${escapeHtml(icon.iconUrl)}" alt="${escapeHtml(altText)}" loading="lazy" referrerpolicy="no-referrer" />
    </span>
  `;
};

const bindCharacterIconFallbacks = (root) => {
  root.querySelectorAll(".character-avatar.has-image img, .character-emblem.has-image img, .duo-avatar.has-image img").forEach((image) => {
    image.addEventListener(
      "error",
      () => {
        const iconBox = image.closest(".character-avatar, .character-emblem, .duo-avatar");

        if (!iconBox) {
          return;
        }

        iconBox.classList.remove("has-image");
        iconBox.textContent = iconBox.dataset.fallback || "?";
      },
      { once: true },
    );
  });
};

const deltaClass = (value, lowerIsBetter = false) => {
  const number = toNumber(value);

  if (number === 0) {
    return "";
  }

  const good = lowerIsBetter ? number < 0 : number > 0;
  return good ? "is-good" : "is-bad";
};

const aggregateCharacters = (rows) => {
  const totalSlots = uniqueTotal(rows, "total_slots");

  return [...groupBy(rows, (row) => row.character_code).entries()]
    .map(([code, groupedRows]) => ({
      code,
      name: groupedRows[0].character_name,
      pickCount: sum(groupedRows, "pick_count"),
      teamCount: sum(groupedRows, "team_count"),
      top3Rate: weightedAverage(groupedRows, "top3_rate", "team_count"),
      winRate: weightedAverage(groupedRows, "win_rate", "team_count"),
      avgRank: weightedAverage(groupedRows, "avg_rank", "team_count"),
      pickShare: totalSlots > 0 ? (sum(groupedRows, "pick_count") / totalSlots) * 100 : 0,
    }))
    .sort((left, right) => right.pickShare - left.pickShare);
};

const aggregateCharacterWeapons = (rows) =>
  new Map(
    [...groupBy(rows, (row) => row.name_ko).entries()].map(([name, groupedRows]) => {
      const sortedRows = groupedRows.sort((left, right) => toNumber(right.pick_count) - toNumber(left.pick_count));
      const primary = sortedRows[0] ?? {};
      const roleCounter = new Map();

      sortedRows.forEach((row) => {
        const weight = Math.max(toNumber(row.pick_count), 1);
        addCount(roleCounter, row.role_main || row.character_role_main_default, weight);
        addCount(roleCounter, row.role_alt || row.character_role_alt_default, weight);
        addCount(roleCounter, row.role_sub_1 || row.character_role_sub_1_default, weight);
        addCount(roleCounter, row.role_sub_2 || row.character_role_sub_2_default, weight);
      });

      const primaryWeapon = primary.weapon_name_ko || "무기 데이터 없음";
      const primaryRole = primary.role_main || primary.character_role_main_default || "역할 미분류";

      return [
        name,
        {
          name,
          primaryWeapon,
          primaryRole,
          buildLabel: `${primaryWeapon} · ${primaryRole}`,
          roleTags: topCounterEntries(roleCounter, 3).map((entry) => entry.label),
        },
      ];
    }),
  );

const aggregateDuos = (rows) => {
  const totalPairSlots = uniqueTotal(rows, "total_pair_slots");

  return [...groupBy(rows, getDuoKey).entries()]
    .map(([key, groupedRows]) => {
      const [first, second] = getDuoMembers(groupedRows[0] ?? {});
      const pairCount = sum(groupedRows, "pair_count");

      return {
        key,
        firstCode: first?.code ?? "",
        firstName: first?.name ?? "",
        secondCode: second?.code ?? "",
        secondName: second?.name ?? "",
        pairCount,
        teamCount: sum(groupedRows, "team_count"),
        top3Rate: weightedAverage(groupedRows, "top3_rate", "team_count"),
        winRate: weightedAverage(groupedRows, "win_rate", "team_count"),
        avgRank: weightedAverage(groupedRows, "avg_rank", "team_count"),
        pairShare: totalPairSlots > 0 ? (pairCount / totalPairSlots) * 100 : 0,
      };
    })
    .sort((left, right) => right.pairCount - left.pairCount);
};

const getDuoKey = (row) => getDuoMembers(row).map((member) => member.name).join("|");

const getSelectedRole = () =>
  state.roles.find((role) => toNumber(role.display_order) === state.selectedOrder) ?? state.roles[0];

const getSelectedCharacter = () =>
  state.characters.find((character) => character.code === state.selectedCharacterCode) ?? state.characters[0];

const getCharacterBuild = (character) =>
  state.characterWeapons.get(character?.name) ?? {
    primaryWeapon: "무기 데이터 없음",
    primaryRole: "역할 미분류",
    buildLabel: "주 무기 데이터 없음",
    roleTags: [],
  };

const getSelectedDuo = () => state.duos.find((duo) => duo.key === state.selectedDuoKey) ?? state.duos[0];

const getSelectedWeapons = (role) =>
  state.weapons
    .filter((weapon) => weapon.weapon_role_signature_sorted === role.primary_signature)
    .sort((left, right) => toNumber(left.weapon_rank_within_role) - toNumber(right.weapon_rank_within_role))
    .slice(0, 5);

const getCharacterDuoPartners = (character) => {
  const code = String(character?.code ?? "");
  const name = character?.name ?? "";

  return state.duos
    .filter((duo) => duo.firstCode === code || duo.secondCode === code)
    .map((duo) => {
      const partner =
        duo.firstCode === code
          ? { code: duo.secondCode, name: duo.secondName }
          : { code: duo.firstCode, name: duo.firstName };

      return {
        label: partner.name,
        meta: `Top3 ${formatPercent(duo.top3Rate)} · 승률 ${formatPercent(duo.winRate)}`,
        value: duo.teamCount,
      };
    })
    .filter((duo) => duo.label && duo.label !== name)
    .sort((left, right) => right.value - left.value)
    .slice(0, 5);
};

const getSampleBackedTop3Duos = () =>
  state.duos
    .filter((duo) => duo.teamCount >= DUO_TOP3_MIN_TEAM_COUNT)
    .sort((left, right) => right.top3Rate - left.top3Rate || right.teamCount - left.teamCount)
    .slice(0, 10);

const renderStatus = (message) => {
  const panel = $("#statusPanel");
  panel.hidden = !message;
  panel.textContent = message;
};

const renderTabs = () => {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.classList.toggle("is-active", tab.dataset.view === state.activeView);
  });

  document.querySelectorAll(".view-section").forEach((section) => {
    section.classList.toggle("is-active", section.id === `${state.activeView}View`);
  });
};

const bindTabs = () => {
  document.querySelectorAll(".view-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      state.activeView = tab.dataset.view;
      renderTabs();
    });
  });
};

const renderRoleList = () => {
  const selected = getSelectedRole();

  $("#roleList").innerHTML = state.roles
    .map((role) => {
      const order = toNumber(role.display_order);
      const activeClass = order === toNumber(selected.display_order) ? " is-active" : "";
      const title = cleanRoleLabel(role.display_label);

      return `
        <button class="role-button${activeClass}" type="button" data-order="${order}">
          <span class="role-title">${escapeHtml(title)}</span>
          <span class="role-meta">
            <span>Top3 ${formatPercent(role.primary_top3_rate)}</span>
            <span>점유 ${formatPercent(role.primary_team_share_pct)}</span>
          </span>
        </button>
      `;
    })
    .join("");

  $("#roleList").querySelectorAll(".role-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedOrder = toNumber(button.dataset.order);
      renderRoleDashboard();
    });
  });
};

const renderKpiCards = (selector, cards) => {
  $(selector).innerHTML = cards
    .map(
      (card) => `
        <article class="kpi-card">
          <div class="kpi-label">${escapeHtml(card.label)}</div>
          <div class="kpi-value">${escapeHtml(card.value)}</div>
          <div class="kpi-delta ${escapeHtml(card.className ?? "")}">${escapeHtml(card.delta)}</div>
        </article>
      `,
    )
    .join("");
};

const renderRoleKpis = (role) => {
  renderKpiCards("#kpiGrid", [
    {
      label: "Top3율",
      value: formatPercent(role.primary_top3_rate),
      delta: `차이 ${formatPointDiff(role.primary_top3_rate_diff)}`,
      className: deltaClass(role.primary_top3_rate_diff),
    },
    {
      label: "승률",
      value: formatPercent(role.primary_win_rate),
      delta: `차이 ${formatPointDiff(role.primary_win_rate_diff)}`,
      className: deltaClass(role.primary_win_rate_diff),
    },
    {
      label: "평균순위",
      value: formatRank(role.primary_avg_rank),
      delta: `차이 ${formatRankDiff(role.primary_avg_rank_diff)}`,
      className: deltaClass(role.primary_avg_rank_diff, true),
    },
    { label: "팀 수", value: formatCount(role.primary_team_count), delta: "선택 조합 기준" },
    { label: "점유율", value: formatPercent(role.primary_team_share_pct), delta: "전체 역할 조합 내 비중" },
  ]);
};

const renderRoleDetail = (role) => {
  $("#detailPanel").innerHTML = `
    <div class="role-detail-copy">
      <p class="detail-kicker">선택 역할 조합</p>
      <h2 class="detail-title">${escapeHtml(cleanRoleLabel(role.primary_signature))}</h2>
      <p class="detail-copy">${escapeHtml(formatStoryTag(role.primary_story_tag))}</p>
    </div>
    <div class="detail-facts role-detail-facts">
      <article class="fact-card fact-card-wide">
        <div class="fact-label">대표 무기 조합</div>
        <div class="fact-value">${escapeHtml(cleanRoleLabel(role.secondary_signature))}</div>
      </article>
      <article class="fact-card">
        <div class="fact-label">대표 무기 태그</div>
        <div class="fact-value">${escapeHtml(formatStoryTag(role.secondary_story_tag))}</div>
      </article>
      <article class="fact-card">
        <div class="fact-label">역할 내 비중</div>
        <div class="fact-value">${formatPercent(role.secondary_share_pct)}</div>
      </article>
    </div>
  `;
};

const renderBarChart = (selector, rows, options) => {
  const maxValue = Math.max(...rows.map((row) => toNumber(row.value)), 0);

  if (rows.length === 0 || maxValue === 0) {
    $(selector).innerHTML = `<div class="empty-state">${escapeHtml(options.emptyText)}</div>`;
    return;
  }

  $(selector).innerHTML = rows
    .map((row) => {
      const width = Math.max((toNumber(row.value) / maxValue) * 100, 4);

      return `
        <div class="bar-row">
          <div class="bar-label">
            <span>${escapeHtml(row.label)}</span>
            ${row.meta ? `<small>${escapeHtml(row.meta)}</small>` : ""}
          </div>
          <div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div>
          <div class="bar-value">${escapeHtml(options.format(row.value))}</div>
        </div>
      `;
    })
    .join("");
};

const renderWeaponChart = (role) => {
  renderBarChart(
    "#weaponChart",
    getSelectedWeapons(role).map((weapon) => ({
      label: cleanRoleLabel(weapon.weapon_signature_sorted),
      value: weapon.top3_rate,
    })),
    {
      emptyText: "선택 조합에 연결된 무기 Top5가 없음",
      format: formatPercent,
    },
  );
};

const renderRoleDuoValidation = (role) => {
  const mount = $("#roleDuoValidation");

  if (!mount) {
    return;
  }

  renderRoleDuoValidationPanel({
    mount,
    role,
    validationByRole: state.roleDuoValidation,
    tools: {
      escapeHtml,
      formatCount,
      formatPercent,
      formatRank,
      renderCharacterIcon,
    },
  });

  bindCharacterIconFallbacks(mount);
};

const renderMlRoleAdjustment = (role) => {
  const mount = $("#mlRoleAdjustment");

  if (!mount) {
    return;
  }

  renderMlRoleAdjustmentPanel({
    mount,
    role,
    adjustmentByRole: state.mlRoleAdjustment,
    topOver: state.mlRoleAdjustmentTopOver,
    topUnder: state.mlRoleAdjustmentTopUnder,
    summary: state.mlRoleAdjustmentSummary,
    metrics: state.mlRoleAdjustmentMetrics,
    tools: {
      escapeHtml,
      formatCount,
      formatPercent,
      formatDecimal,
      formatMultiplier,
    },
  });
};

const renderAiRoleBriefing = (role) => {
  const mount = $("#aiRoleBriefing");

  if (!mount) {
    return;
  }

  renderAiRoleBriefingPanel({
    mount,
    role,
    briefingByRole: state.aiRoleBriefings,
    meta: state.aiRoleBriefingsMeta,
    tools: { escapeHtml },
  });
};

const renderRoleDashboard = () => {
  const selected = getSelectedRole();
  renderRoleList();
  renderRoleKpis(selected);
  renderRoleDetail(selected);
  renderWeaponChart(selected);
  renderMlRoleAdjustment(selected);
  renderAiRoleBriefing(selected);
  renderRoleDuoValidation(selected);
};

const renderCharacterList = () => {
  const selected = getSelectedCharacter();

  $("#characterList").innerHTML = state.characters
    .slice(0, 30)
    .map((character) => {
      const activeClass = character.code === selected.code ? " is-active" : "";
      const build = getCharacterBuild(character);

      return `
        <button class="ranking-button character-button${activeClass}" type="button" data-code="${escapeHtml(character.code)}">
          ${renderCharacterIcon(character, "character-avatar", { decorative: true })}
          <span class="character-row-copy">
            <span class="ranking-title">${escapeHtml(character.name)}</span>
            <span class="character-build">${escapeHtml(build.buildLabel)}</span>
            <span class="ranking-meta">
              <span>픽률 ${formatPercent(character.pickShare)}</span>
              <span>Top3 ${formatPercent(character.top3Rate)}</span>
            </span>
          </span>
        </button>
      `;
    })
    .join("");

  bindCharacterIconFallbacks($("#characterList"));

  $("#characterList").querySelectorAll(".ranking-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedCharacterCode = button.dataset.code;
      renderCharacterDashboard();
    });
  });
};

const renderCharacterDashboard = () => {
  const selected = getSelectedCharacter();
  const build = getCharacterBuild(selected);
  const roleTags = build.roleTags.length > 0 ? build.roleTags : ["역할 미분류"];
  const characterChartTitle = $("#characterChart")?.closest(".chart-panel")?.querySelector("h2");

  renderCharacterList();
  renderKpiCards("#characterKpiGrid", [
    { label: "픽률", value: formatPercent(selected.pickShare), delta: "전체 슬롯 내 선택 비중" },
    { label: "Top3율", value: formatPercent(selected.top3Rate), delta: "팀 기준 평균" },
    { label: "승률", value: formatPercent(selected.winRate), delta: "팀 기준 평균" },
    { label: "평균순위", value: formatRank(selected.avgRank), delta: "낮을수록 좋음" },
    { label: "픽 수", value: formatCount(selected.pickCount), delta: "분석 기간 합산" },
  ]);

  $("#characterDetailPanel").innerHTML = `
    <div class="character-identity">
      ${renderCharacterIcon(selected, "character-emblem")}
      <div>
        <p class="detail-kicker">선택 캐릭터</p>
        <h2 class="detail-title">${escapeHtml(selected.name)}</h2>
        <p class="detail-copy">현재 표본에서 자주 쓰인 무기와 역할 빌드</p>
        <div class="chip-row">
          ${roleTags.map((tag) => `<span class="info-chip">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
    </div>
    <div class="detail-facts character-detail-facts">
      <article class="fact-card">
        <div class="fact-label">주 사용 무기</div>
        <div class="fact-value">${escapeHtml(build.primaryWeapon)}</div>
      </article>
      <article class="fact-card">
        <div class="fact-label">빌드/포지션</div>
        <div class="fact-value">${escapeHtml(build.buildLabel)}</div>
      </article>
      <article class="fact-card">
        <div class="fact-label">역할 태그</div>
        <div class="fact-value">${escapeHtml(roleTags.join(" · "))}</div>
      </article>
    </div>
  `;

  bindCharacterIconFallbacks($("#characterDetailPanel"));

  if (characterChartTitle) {
    characterChartTitle.textContent = "선택 캐릭터 주요 듀오 Top5";
  }

  renderBarChart("#characterChart", getCharacterDuoPartners(selected), {
    emptyText: "선택 캐릭터와 연결된 듀오 데이터가 없음",
    format: (value) => `${formatCount(value)}팀`,
  });
};

const renderDuoList = () => {
  const selected = getSelectedDuo();

  $("#duoList").innerHTML = state.duos
    .slice(0, 30)
    .map((duo) => {
      const activeClass = duo.key === selected.key ? " is-active" : "";

      return `
        <button class="ranking-button duo-button${activeClass}" type="button" data-key="${escapeHtml(duo.key)}">
          <span class="duo-icon-pair" aria-hidden="true">
            ${renderCharacterIcon({ code: duo.firstCode, name: duo.firstName }, "duo-avatar", { decorative: true })}
            ${renderCharacterIcon({ code: duo.secondCode, name: duo.secondName }, "duo-avatar", { decorative: true })}
          </span>
          <span class="ranking-copy">
            <span class="ranking-title">${escapeHtml(`${duo.firstName} + ${duo.secondName}`)}</span>
            <span class="ranking-meta">
              <span>팀 ${formatCount(duo.teamCount)}</span>
              <span>Top3 ${formatPercent(duo.top3Rate)}</span>
            </span>
          </span>
        </button>
      `;
    })
    .join("");

  bindCharacterIconFallbacks($("#duoList"));

  $("#duoList").querySelectorAll(".ranking-button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDuoKey = button.dataset.key;
      renderDuoDashboard();
    });
  });
};

const renderDuoDashboard = () => {
  const selected = getSelectedDuo();
  renderDuoList();
  renderKpiCards("#duoKpiGrid", [
    { label: "조합 점유", value: formatPercent(selected.pairShare), delta: "전체 듀오 편성 내 비중" },
    { label: "Top3율", value: formatPercent(selected.top3Rate), delta: "팀 기준 평균" },
    { label: "승률", value: formatPercent(selected.winRate), delta: "팀 기준 평균" },
    { label: "평균순위", value: formatRank(selected.avgRank), delta: "낮을수록 좋음" },
    { label: "팀 수", value: formatCount(selected.teamCount), delta: "동시 편성 표본" },
  ]);

  $("#duoDetailPanel").innerHTML = `
    <div class="duo-identity">
      <div class="duo-members" aria-hidden="true">
        ${renderCharacterIcon({ code: selected.firstCode, name: selected.firstName }, "duo-avatar", { decorative: true })}
        ${renderCharacterIcon({ code: selected.secondCode, name: selected.secondName }, "duo-avatar", { decorative: true })}
      </div>
      <div>
        <p class="detail-kicker">선택 듀오 조합</p>
        <h2 class="detail-title">${escapeHtml(`${selected.firstName} + ${selected.secondName}`)}</h2>
        <p class="detail-copy">같은 팀에 함께 편성된 듀오 기준</p>
      </div>
    </div>
    <div class="detail-facts duo-detail-facts">
      <article class="fact-card">
        <div class="fact-label">페어 등장</div>
        <div class="fact-value">${formatCount(selected.pairCount)}</div>
      </article>
      <article class="fact-card">
        <div class="fact-label">표본 팀 수</div>
        <div class="fact-value">${formatCount(selected.teamCount)}</div>
      </article>
    </div>
  `;

  bindCharacterIconFallbacks($("#duoDetailPanel"));

  renderBarChart(
    "#duoChart",
    getSampleBackedTop3Duos().map((duo) => ({
      label: `${duo.firstName} + ${duo.secondName}`,
      meta: `팀 ${formatCount(duo.teamCount)} · 승률 ${formatPercent(duo.winRate)}`,
      value: duo.top3Rate,
    })),
    {
      emptyText: "표본 300팀 이상 듀오 데이터가 없음",
      format: formatPercent,
    },
  );
};

const renderTimelineView = () => {
  renderTimelineDashboard({
    state,
    tools: { escapeHtml, toNumber, formatPercent, formatPointDiff, formatRank, formatCount, renderCharacterIcon, bindCharacterIconFallbacks, renderKpiCards },
  });
};

const renderAll = () => {
  renderTabs();
  renderRoleDashboard();
  renderCharacterDashboard();
  renderDuoDashboard();
  renderTimelineView();
};

const boot = async () => {
  try {
    renderStatus("CSV 데이터를 불러오는 중");
    bindTabs();

    const [
      storyFeed,
      roleWeaponTop5,
      characterRows,
      versionCompareRows,
      characterWeaponRows,
      characterIcons,
      duoRows,
      roleDuoValidation,
      mlRoleAdjustment,
      aiRoleBriefings,
      timelineBriefing,
    ] = await Promise.all([
      loadCsv(DATA_PATHS.storyFeed),
      loadCsv(DATA_PATHS.roleWeaponTop5),
      loadCsv(DATA_PATHS.characters),
      loadCsv(DATA_PATHS.versionCompare),
      loadCsv(DATA_PATHS.characterWeapons),
      loadJson(DATA_PATHS.characterIcons).catch(() => []),
      loadCsv(DATA_PATHS.duos),
      loadJson(DATA_PATHS.roleDuoValidation).catch(() => ({ roles: [] })),
      loadJson(DATA_PATHS.mlRoleAdjustment).catch(() => ({ groups: [], topOver: [], topUnder: [], summary: {}, metrics: {} })),
      loadJson(DATA_PATHS.aiRoleBriefings).catch(() => ({ briefings: [] })),
      loadJson(DATA_PATHS.timelineBriefing).catch(() => ({ characterBriefings: [] })),
    ]);

    state.roles = storyFeed
      .filter((row) => row.section === "역할 조합")
      .sort((left, right) => toNumber(left.display_order) - toNumber(right.display_order));
    state.weapons = roleWeaponTop5;
    state.characterDailyRows = characterRows;
    state.characters = aggregateCharacters(characterRows);
    state.versionCompare = aggregateVersionCompare(versionCompareRows, toNumber);
    state.versionSummary = aggregateVersionSummary(characterRows, toNumber);
    state.characterWeapons = aggregateCharacterWeapons(characterWeaponRows);
    state.characterIcons = new Map(characterIcons.map((icon) => [String(icon.code), icon]));
    state.duos = aggregateDuos(duoRows);
    state.roleDuoValidation = buildRoleDuoValidationIndex(roleDuoValidation);
    state.mlRoleAdjustment = buildMlRoleAdjustmentIndex(mlRoleAdjustment);
    state.mlRoleAdjustmentTopOver = mlRoleAdjustment.topOver ?? [];
    state.mlRoleAdjustmentTopUnder = mlRoleAdjustment.topUnder ?? [];
    state.mlRoleAdjustmentSummary = mlRoleAdjustment.summary ?? {};
    state.mlRoleAdjustmentMetrics = mlRoleAdjustment.metrics ?? {};
    state.aiRoleBriefings = buildAiRoleBriefingIndex(aiRoleBriefings);
    state.aiRoleBriefingsMeta = { mode: aiRoleBriefings.mode, generatedAt: aiRoleBriefings.generatedAt };
    state.timelineBriefing = timelineBriefing;
    state.timelineCharacterBriefings = buildTimelineBriefingIndex(timelineBriefing);
    state.selectedOrder = toNumber(state.roles[0]?.display_order ?? 1);
    state.selectedCharacterCode = state.characters[0]?.code ?? null;
    state.selectedDuoKey = state.duos[0]?.key ?? null;
    state.selectedTimelineCode = state.versionCompare[0]?.code ?? state.characters[0]?.code ?? null;

    renderStatus("");
    renderAll();
  } catch (error) {
    renderStatus(`${error.message}. 프로젝트 루트에서 py -m http.server 8787 실행 후 http://localhost:8787/web/ 로 열어야 함`);
  }
};

boot();
