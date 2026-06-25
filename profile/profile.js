import { renderNavbar } from "/components/navbar.js";
import { HalftoneBackground } from "../components/halftone.js";

// ═══════════════════════════════════════════════════════════
//  데이터 — 여기만 수정하면 페이지 내용이 바뀝니다
// ═══════════════════════════════════════════════════════════

const ABOUT = {
    tagline: "// still compiling...",
    paragraphs: [
        "코드를 짜고 이것저것 뜯어보는 걸 좋아합니다. 모르는 게 있으면 알아낼 때까지 파고드는 편이에요.",
        "AI, 소프트웨어, 그리고 뭔가 새로운 것들에 관심이 많습니다.",
    ],
    interests: ["AI", "알고리즘", "소프트웨어", "수학"],
    // 관심 분야 추가: 배열에 문자열 추가
};

const MAX_DOTS = 5; // 도트 최대 개수

const SKILLS = [
    { name: "C++",    level: 2 },  // 1~5 (하프톤 도트 크기로 표현)
    { name: "Python", level: 2 },
    // { name: "새 기술", level: 4 },
];

const TIMELINE = [
    {
        period: "2023 – 2025",
        place:  "경북대학교사범대학부설고등학교",
        desc:   "IB Bilingual Diploma 이수",
    },
    {
        period: "2026 –",
        place:  "숭실대학교 AI소프트웨어학부",
        desc:   "재학",
    },
    // { period: "20xx –", place: "장소", desc: "내용" },
];

const CONTACTS = [
    {
        name:   "GitHub",
        url:    "https://github.com/SuwonJ/",
        logo:   "/assets/logos/github.svg",
        handle: "@SuwonJ",
    },
    {
        name:   "Email",
        url:    "mailto:stdsuwon@gmail.com",
        logo:   "/assets/logos/email.svg",
        handle: "stdsuwon@gmail.com",
    },
    {
        name:   "Telegram",
        url:    "https://t.me/suwonmars",
        logo:   "/assets/logos/telegram.svg",
        handle: "@suwonmars",
    },
    {
        name:   "Instagram",
        url:    "https://www.instagram.com/suwonmars/",
        logo:   "/assets/logos/instagram.svg",
        handle: "@suwonmars",
    },
    // { name: "새 채널", url: "https://...", logo: "/assets/logos/새로고침.svg", handle: "@핸들" },
];

// ═══════════════════════════════════════════════════════════
//  섹션 렌더러
// ═══════════════════════════════════════════════════════════

function renderHero() {
    return `
        <section class="profile-section profile-hero">
            <h1>SuwonJ</h1>
            <p class="profile-tagline">${ABOUT.tagline}</p>
        </section>
    `;
}

function renderAbout() {
    const paragraphs = ABOUT.paragraphs
        .map(p => `<p class="about-text">${p}</p>`)
        .join("");
    const tags = ABOUT.interests
        .map(t => `<span class="interest-tag">${t}</span>`)
        .join("");
    return `
        <hr />
        <section class="profile-section">
            <p class="section-label">About</p>
            ${paragraphs}
            <div class="interest-tags">${tags}</div>
        </section>
    `;
}

function renderSkills() {
    const items = SKILLS.map(s => {
        let dots = "";
        for (let i = 1; i <= MAX_DOTS; i++) {
            const filled = i <= s.level;
            // 채워진 도트: 크고 밝음 / 빈 도트: 작고 어두움
            const size = filled ? 8 : 5;
            dots += `<span class="skill-dot ${filled ? 'filled' : 'empty'}" style="width:${size}px;height:${size}px;"></span>`;
        }
        return `
            <div class="skill-item">
                <span class="skill-name">${s.name}</span>
                <div class="skill-dots">${dots}</div>
            </div>
        `;
    }).join("");
    return `
        <hr />
        <section class="profile-section">
            <p class="section-label">Skills</p>
            <div class="skills-list">${items}</div>
        </section>
    `;
}

function renderTimeline() {
    const items = TIMELINE.map(t => `
        <div class="timeline-item">
            <p class="timeline-period">${t.period}</p>
            <p class="timeline-place">${t.place}</p>
            <p class="timeline-desc">${t.desc}</p>
        </div>
    `).join("");
    return `
        <hr />
        <section class="profile-section">
            <p class="section-label">Timeline</p>
            <div class="timeline">${items}</div>
        </section>
    `;
}

function renderContact() {
    const cards = CONTACTS.map(c => `
        <a
            class="contact-card"
            href="${c.url}"
            data-logo="${c.logo}"
            target="_blank"
            rel="noopener noreferrer"
        >
            <span class="contact-service">${c.name}</span>
            <span class="contact-handle">${c.handle}</span>
        </a>
    `).join("");
    return `
        <hr />
        <section class="profile-section">
            <p class="section-label">Contact</p>
            <div class="contact-list">${cards}</div>
        </section>
    `;
}

// ═══════════════════════════════════════════════════════════
//  초기화
// ═══════════════════════════════════════════════════════════

function init() {
    renderNavbar();

    // 콘텐츠 렌더링
    const root = document.getElementById("profile-root");
    root.innerHTML =
        renderHero() +
        renderAbout() +
        renderSkills() +
        renderTimeline() +
        renderContact();

    // 하프톤 배경 초기화
    // — iconSrc: null (기본 배경 없음, 호버 시 로고로 교체)
    // — iconScale: 0.38 (로고가 너무 크지 않게)
    // — buttonSelectors: 연락처 카드에 테두리 하프톤 효과
    const profileBg = new HalftoneBackground("halftone-canvas", {
        iconSrc: null,
        iconScale: 0.38,
        boundarySelectors: [".navbar", "hr"],
        buttonSelectors: [],
    });
    profileBg.init();

    // 연락처 카드 호버 → 하프톤 로고 전환
    document.querySelectorAll(".contact-card").forEach(card => {
        card.addEventListener("mouseenter", () => {
            profileBg.setIcon(card.dataset.logo);
        });
        card.addEventListener("mouseleave", () => {
            profileBg.setIcon(null);
        });
    });

    // 스크롤 마스크 연동 (global.css의 main mask-position용)
    window.addEventListener("scroll", () => {
        const mainEl = document.querySelector("main");
        if (mainEl) mainEl.style.setProperty("--scroll-y", `${window.scrollY}px`);
    });

    // 콘텐츠 렌더 후 타겟 재스캔 (hr 위치 등)
    profileBg.scanTargets();
    setTimeout(() => profileBg.scanTargets(), 300);
}

init();
