"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LEVELS,
  MISSIONS,
  THEMES,
  type ConversationStep,
  type LevelId,
  type MissionId,
  type VocabularyWord,
} from "@/lib/content";

type Screen = "home" | "missions" | "themes" | "game";
type CompletionMap = Record<string, boolean>;
type Card = { id: string; pairId: string; side: "picture" | "word"; word: VocabularyWord };
type Coordinate = [number, number];
type Placement = { wordId: string; cells: Coordinate[] };
type Puzzle = { grid: string[][]; placements: Placement[] };
type LetterTile = { id: number; letter: string };

const STORAGE_KEY = "mission-arabic-progress-v1";
const ARABIC_LETTERS = Array.from("ابتثجحخدذرزسشصضطظعغفقكلمنهوي");

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function speakArabic(text: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  if (typeof SpeechSynthesisUtterance === "undefined") return;
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  const arabicVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith("ar"));
  if (arabicVoice) utterance.voice = arabicVoice;
  utterance.lang = arabicVoice?.lang ?? "ar-SA";
  utterance.rate = 0.82;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function makeMemoryCards(words: VocabularyWord[]): Card[] {
  const cards = words.flatMap((word) => [
    { id: `${word.id}-picture`, pairId: word.id, side: "picture" as const, word },
    { id: `${word.id}-word`, pairId: word.id, side: "word" as const, word },
  ]);
  return shuffle(cards);
}

function makeWordSearch(words: VocabularyWord[], size: number): Puzzle {
  const grid = Array.from({ length: size }, () => Array.from({ length: size }, () => ""));
  const placements: Placement[] = [];
  const directions: Coordinate[] = [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]];

  const sortedWords = [...words].sort((a, b) => Array.from(b.arabic).length - Array.from(a.arabic).length);
  for (const word of sortedWords) {
    const letters = Array.from(word.arabic.replace(/\s/g, ""));
    let placed = false;
    for (let attempt = 0; attempt < 2500 && !placed; attempt += 1) {
      const [dr, dc] = directions[Math.floor(Math.random() * directions.length)];
      const startRow = Math.floor(Math.random() * size);
      const startCol = Math.floor(Math.random() * size);
      const endRow = startRow + (letters.length - 1) * dr;
      const endCol = startCol + (letters.length - 1) * dc;
      if (endRow < 0 || endRow >= size || endCol < 0 || endCol >= size) continue;
      const cells = letters.map((_, index): Coordinate => [startRow + index * dr, startCol + index * dc]);
      const fits = cells.every(([row, col], index) => !grid[row][col] || grid[row][col] === letters[index]);
      if (!fits) continue;
      cells.forEach(([row, col], index) => { grid[row][col] = letters[index]; });
      placements.push({ wordId: word.id, cells });
      placed = true;
    }
  }

  const placedIds = new Set(placements.map((item) => item.wordId));
  const missingWords = sortedWords.filter((word) => !placedIds.has(word.id));
  missingWords.forEach((word) => {
    const letters = Array.from(word.arabic.replace(/\s/g, ""));
    let fallbackPlaced = false;
    for (let row = 0; row < size && !fallbackPlaced; row += 1) {
      for (let startCol = 0; startCol <= size - letters.length && !fallbackPlaced; startCol += 1) {
        const cells = letters.map((_, index): Coordinate => [row, startCol + index]);
        const fits = cells.every(([r, c], index) => !grid[r][c] || grid[r][c] === letters[index]);
        if (!fits) continue;
        cells.forEach(([r, c], index) => { grid[r][c] = letters[index]; });
        placements.push({ wordId: word.id, cells });
        fallbackPlaced = true;
      }
    }
  });

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (!grid[row][col]) grid[row][col] = ARABIC_LETTERS[Math.floor(Math.random() * ARABIC_LETTERS.length)];
    }
  }
  return { grid, placements };
}

function getLineCells(start: Coordinate, end: Coordinate): Coordinate[] | null {
  const dr = end[0] - start[0];
  const dc = end[1] - start[1];
  if (dr === 0 && dc === 0) return [start];
  if (!(dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc))) return null;
  const steps = Math.max(Math.abs(dr), Math.abs(dc));
  const stepRow = dr === 0 ? 0 : dr / steps;
  const stepCol = dc === 0 ? 0 : dc / steps;
  return Array.from({ length: steps + 1 }, (_, index): Coordinate => [start[0] + index * stepRow, start[1] + index * stepCol]);
}

function samePath(a: Coordinate[], b: Coordinate[]): boolean {
  if (a.length !== b.length) return false;
  const forward = a.every(([r, c], i) => r === b[i][0] && c === b[i][1]);
  const reverse = a.every(([r, c], i) => r === b[b.length - 1 - i][0] && c === b[b.length - 1 - i][1]);
  return forward || reverse;
}

function makeLetterTiles(word: string): LetterTile[] {
  const letters = Array.from(word.replace(/\s/g, ""));
  let mixed = shuffle(letters);
  if (mixed.join("") === letters.join("") && mixed.length > 1) mixed = [...mixed.slice(1), mixed[0]];
  return mixed.map((letter, id) => ({ id, letter }));
}

function progressKey(level: LevelId, mission: MissionId, theme: string) {
  return `${level}:${mission}:${theme}`;
}

function countCompleted(completed: CompletionMap, level?: LevelId, mission?: MissionId) {
  return Object.entries(completed).filter(([key, value]) => {
    if (!value) return false;
    const [keyLevel, keyMission] = key.split(":");
    return (!level || keyLevel === level) && (!mission || keyMission === mission);
  }).length;
}

export default function MissionArabicApp() {
  const [screen, setScreen] = useState<Screen>("home");
  const [levelId, setLevelId] = useState<LevelId>("easy");
  const [missionId, setMissionId] = useState<MissionId>("memory");
  const [themeId, setThemeId] = useState<string>(THEMES[0].id);
  const [completed, setCompleted] = useState<CompletionMap>({});
  const [xp, setXp] = useState(0);
  const [hydrated, setHydrated] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const completionGuard = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as { completed?: CompletionMap; xp?: number };
        setCompleted(parsed.completed ?? {});
        setXp(parsed.xp ?? 0);
      }
    } catch {
      // If browser storage is unavailable or malformed, the game still works in memory.
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ completed, xp }));
    } catch {
      // Private browsing or storage limits should not block gameplay.
    }
  }, [completed, xp, hydrated]);

  const level = LEVELS.find((item) => item.id === levelId) ?? LEVELS[0];
  const mission = MISSIONS.find((item) => item.id === missionId) ?? MISSIONS[0];
  const theme = THEMES.find((item) => item.id === themeId) ?? THEMES[0];
  const currentKey = progressKey(levelId, missionId, themeId);
  const totalCompleted = countCompleted(completed);
  const levelCompleted = countCompleted(completed, levelId);
  const missionCompleted = countCompleted(completed, levelId, missionId);

  function openLevel(nextLevel: LevelId) {
    setLevelId(nextLevel);
    setScreen("missions");
  }

  function openMission(nextMission: MissionId) {
    setMissionId(nextMission);
    setScreen("themes");
  }

  function openTheme(nextTheme: string) {
    setThemeId(nextTheme);
    setScreen("game");
  }

  const markComplete = useCallback(() => {
    if (completed[currentKey] || completionGuard.current.has(currentKey)) return;
    completionGuard.current.add(currentKey);
    setCompleted((previous) => ({ ...previous, [currentKey]: true }));
    setXp((previous) => previous + 20);
  }, [completed, currentKey]);

  function goBack() {
    if (screen === "game") setScreen("themes");
    else if (screen === "themes") setScreen("missions");
    else if (screen === "missions") setScreen("home");
  }

  function resetProgress() {
    const confirmed = window.confirm("Hapus seluruh progres permainan di perangkat ini?");
    if (!confirmed) return;
    setCompleted({});
    setXp(0);
    completionGuard.current.clear();
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("home")} aria-label="Kembali ke beranda">
          <span className="brand-mark">م</span>
          <span className="brand-copy"><strong>MISSION ARABIC</strong><small>Learn • Play • Speak</small></span>
        </button>
        <div className="topbar-actions">
          <div className="xp-pill"><span>✦</span> {xp} XP</div>
          <button className="icon-button sound-toggle" onClick={() => setSoundEnabled((value) => !value)} aria-label={soundEnabled ? "Nonaktifkan suara" : "Aktifkan suara"} title={soundEnabled ? "Suara aktif" : "Suara nonaktif"}>
            {soundEnabled ? "🔊" : "🔇"}
          </button>
        </div>
      </header>

      {screen !== "home" && (
        <div className="breadcrumb-row">
          <button className="back-button" onClick={goBack}>← Kembali</button>
          <div className="breadcrumbs">
            <button onClick={() => setScreen("home")}>Beranda</button><span>/</span>
            {screen !== "missions" && <><button onClick={() => setScreen("missions")}>{level.title}</button><span>/</span></>}
            {screen === "game" && <><button onClick={() => setScreen("themes")}>{mission.title}</button><span>/</span></>}
            <span className="breadcrumb-current">{screen === "missions" ? "Pilih Misi" : screen === "themes" ? mission.title : theme.title}</span>
          </div>
        </div>
      )}

      {screen === "home" && (
        <>
          <section className="hero-panel">
            <div className="hero-content">
              <span className="eyebrow"><span className="eyebrow-dot" /> PETUALANGAN BAHASA ARAB</span>
              <h1>Belajar Bahasa Arab<br /><em>jadi lebih seru.</em></h1>
              <p>Selesaikan misi, kumpulkan poin, dan temukan serunya belajar kosakata serta percakapan Bahasa Arab.</p>
              <div className="hero-actions">
                <button className="primary-button" onClick={() => document.getElementById("level-selection")?.scrollIntoView({ behavior: "smooth" })}>Mulai petualangan <span>↗</span></button>
                <div className="hero-note"><span>🎯</span><span>Materi CEFR A1–A2</span></div>
              </div>
            </div>
            <div className="hero-art" aria-hidden="true">
              <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" />
              <div className="hero-sun">☀️</div>
              <div className="hero-book">📖</div>
              <div className="hero-character">🧑🏻‍🎓</div>
              <div className="floating-word word-one" dir="rtl">مَرْحَبًا</div>
              <div className="floating-word word-two" dir="rtl">شُكْرًا</div>
              <div className="floating-star star-one">✦</div><div className="floating-star star-two">✧</div>
            </div>
            <div className="hero-bottom"><span>01</span><span className="hero-line" /><span>LEARN AT YOUR OWN PACE</span></div>
          </section>

          <section className="stats-strip" aria-label="Ringkasan progres">
            <div className="stat-item"><span className="stat-icon">🧭</span><div><strong>3</strong><small>Tingkat kesulitan</small></div></div>
            <div className="stat-item"><span className="stat-icon">🎮</span><div><strong>4</strong><small>Jenis misi</small></div></div>
            <div className="stat-item"><span className="stat-icon">📚</span><div><strong>9</strong><small>Tema kosakata</small></div></div>
            <div className="stat-item"><span className="stat-icon">🏅</span><div><strong>{totalCompleted}/108</strong><small>Sub-misi selesai</small></div></div>
          </section>

          <section className="section-block" id="level-selection">
            <div className="section-heading">
              <div><span className="section-kicker">PILIH PERJALANANMU</span><h2>Mulai dari level mana?</h2><p>Semua level berada dalam rentang kemampuan Bahasa Arab A1–A2.</p></div>
              <div className="progress-mini"><span>Progres keseluruhan</span><strong>{Math.round((totalCompleted / 108) * 100)}%</strong><div className="progress-track"><i style={{ width: `${(totalCompleted / 108) * 100}%` }} /></div></div>
            </div>
            <div className="level-grid">
              {LEVELS.map((item, index) => {
                const done = countCompleted(completed, item.id);
                return (
                  <button key={item.id} className={`level-card level-${item.color}`} onClick={() => openLevel(item.id)}>
                    <div className="level-card-top"><span className="level-emoji">{item.emoji}</span><span className="level-number">0{index + 1}</span></div>
                    <span className="level-cefr">CEFR {item.cefr}</span>
                    <h3>{item.title}</h3>
                    <span className="level-subtitle">{item.subtitle}</span>
                    <p>{item.description}</p>
                    <div className="level-card-bottom"><span>{done}/36 sub-misi</span><span className="level-arrow">↗</span></div>
                    <div className="level-progress"><i style={{ width: `${(done / 36) * 100}%` }} /></div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="how-section">
            <div><span className="section-kicker">CARA BERMAIN</span><h2>Empat misi, satu tujuan.</h2><p>Latih ingatan, ketelitian, kemampuan menyusun kata, dan keberanian berbicara.</p></div>
            <div className="how-grid">
              {MISSIONS.map((item, index) => <div className="how-card" key={item.id}><span className="how-number">0{index + 1}</span><span className="how-emoji">{item.emoji}</span><strong>{item.title}</strong><small>{item.subtitle}</small></div>)}
            </div>
          </section>
        </>
      )}

      {screen === "missions" && (
        <section className="inner-page">
          <div className="page-intro">
            <div className={`page-level-icon level-${level.color}`}>{level.emoji}</div>
            <div><span className="section-kicker">CEFR {level.cefr} · LEVEL {level.title.toUpperCase()}</span><h1>Pilih misi kamu.</h1><p>{level.description}</p></div>
          </div>
          <div className="completion-banner"><div><strong>{levelCompleted}/36</strong><span>sub-misi selesai pada level {level.title.toLowerCase()}</span></div><div className="completion-bar"><i style={{ width: `${(levelCompleted / 36) * 100}%` }} /></div></div>
          <div className="mission-grid">
            {MISSIONS.map((item, index) => {
              const done = countCompleted(completed, levelId, item.id);
              return <button key={item.id} className="mission-card" onClick={() => openMission(item.id)}>
                <div className="mission-card-top"><span className="mission-icon">{item.emoji}</span><span className="mission-index">MISSION 0{index + 1}</span></div>
                <h2>{item.title}</h2><strong className="mission-subtitle">{item.subtitle}</strong><p>{item.description}</p>
                <div className="mission-card-bottom"><span>{done}/9 tema selesai</span><span className="circle-arrow">↗</span></div>
                <div className="mission-progress"><i style={{ width: `${(done / 9) * 100}%` }} /></div>
              </button>;
            })}
          </div>
          <div className="tip-card"><span>💡</span><p><strong>Tips:</strong> Selesaikan satu tema terlebih dahulu sebelum berpindah ke tema berikutnya agar kosakata lebih mudah diingat.</p></div>
        </section>
      )}

      {screen === "themes" && (
        <section className="inner-page">
          <div className="page-intro compact-intro">
            <div className="page-level-icon mission-intro-icon">{mission.emoji}</div>
            <div><span className="section-kicker">{mission.title.toUpperCase()} · LEVEL {level.title.toUpperCase()}</span><h1>Pilih tema belajar.</h1><p>Setiap tema dimainkan secara terpisah. Selesaikan satu per satu sesuai pilihanmu.</p></div>
          </div>
          <div className="theme-summary"><span>{mission.emoji}</span><div><strong>{mission.title}</strong><small>{mission.description}</small></div><div className="theme-summary-progress"><strong>{missionCompleted}/9</strong><small>tema selesai</small></div></div>
          <div className="theme-grid">
            {THEMES.map((item, index) => {
              const done = Boolean(completed[progressKey(levelId, missionId, item.id)]);
              return <button key={item.id} className={`theme-card ${done ? "is-complete" : ""}`} onClick={() => openTheme(item.id)}>
                <div className="theme-card-head"><span className="theme-emoji">{item.emoji}</span><span className="theme-index">0{index + 1}</span></div>
                <div className="theme-arabic" dir="rtl">{item.arabicTitle}</div>
                <h3>{item.title}</h3><p>{item.description}</p>
                <div className="theme-card-foot"><span>{done ? "Sudah selesai" : "Mulai tema"}</span><span className="theme-status">{done ? "✓" : "↗"}</span></div>
              </button>;
            })}
          </div>
        </section>
      )}

      {screen === "game" && (
        <section className="game-page">
          <div className="game-heading">
            <div><span className="section-kicker">{mission.title.toUpperCase()} · {level.cefr}</span><h1>{theme.emoji} {theme.title}</h1><p>{theme.arabicTitle} <span>·</span> {level.title}</p></div>
            <div className="game-heading-badges"><span className="game-level-badge">{level.cefr}</span>{completed[currentKey] && <span className="completed-badge">✓ Selesai sebelumnya</span>}</div>
          </div>
          <div className="game-instructions">
            <span className="instruction-icon">{mission.emoji}</span>
            <div><strong>{mission.title}</strong><p>{mission.description}</p></div>
            <button className="audio-help" onClick={() => speakArabic(theme.arabicTitle)} disabled={!soundEnabled}>🔊 Dengarkan tema</button>
          </div>
          {missionId === "memory" && <MemoryGame key={currentKey} words={theme.words.slice(0, level.memoryCount)} onComplete={markComplete} onBack={() => setScreen("themes")} soundEnabled={soundEnabled} />}
          {missionId === "word-search" && <WordSearchGame key={currentKey} words={theme.words.slice(0, level.searchCount)} size={level.searchSize} onComplete={markComplete} onBack={() => setScreen("themes")} soundEnabled={soundEnabled} />}
          {missionId === "arrange" && <ArrangeGame key={currentKey} words={theme.words.slice(0, level.arrangeCount)} onComplete={markComplete} onBack={() => setScreen("themes")} soundEnabled={soundEnabled} />}
          {missionId === "conversation" && <ConversationGame key={currentKey} steps={theme.conversation.slice(0, level.conversationCount)} onComplete={markComplete} onBack={() => setScreen("themes")} soundEnabled={soundEnabled} />}
          <div className="game-footer"><button className="text-button" onClick={() => setScreen("themes")}>← Kembali ke daftar tema</button><span>Progres tema: {completed[currentKey] ? "Selesai" : "Sedang dimainkan"}</span></div>
        </section>
      )}

      <footer className="site-footer"><div className="footer-brand"><span className="brand-mark small-mark">م</span><strong>MISSION ARABIC</strong></div><span>Belajar Bahasa Arab dengan cara yang menyenangkan.</span><span className="footer-cefr">CEFR A1–A2</span></footer>
      {screen === "home" && <button className="reset-progress" onClick={resetProgress} title="Hapus progres di perangkat ini">Reset progres</button>}
    </main>
  );
}

function CompletionPanel({ title, detail, onReplay, onBack }: { title: string; detail: string; onReplay?: () => void; onBack: () => void }) {
  return <div className="completion-panel"><div className="completion-confetti">🎉</div><span className="section-kicker">MISSION COMPLETED</span><h2>{title}</h2><p>{detail}</p><div className="completion-reward">✦ +20 XP</div><div className="completion-actions">{onReplay && <button className="secondary-button" onClick={onReplay}>Main lagi</button>}<button className="primary-button" onClick={onBack}>Kembali ke tema <span>↗</span></button></div></div>;
}

function MemoryGame({ words, onComplete, onBack, soundEnabled }: { words: VocabularyWord[]; onComplete: () => void; onBack: () => void; soundEnabled: boolean }) {
  const [cards, setCards] = useState<Card[]>(() => makeMemoryCards(words));
  const [opened, setOpened] = useState<string[]>([]);
  const [matched, setMatched] = useState<string[]>([]);
  const [moves, setMoves] = useState(0);
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (opened.length !== 2) return;
    setLocked(true);
    setMoves((value) => value + 1);
    const first = cards.find((card) => card.id === opened[0]);
    const second = cards.find((card) => card.id === opened[1]);
    const isMatch = Boolean(first && second && first.pairId === second.pairId);
    const timer = window.setTimeout(() => {
      if (isMatch && first) {
        setMatched((previous) => [...previous, first.pairId]);
      }
      setOpened([]);
      setLocked(false);
    }, isMatch ? 420 : 850);
    return () => window.clearTimeout(timer);
  }, [opened, cards, words.length]);

  useEffect(() => {
    if (matched.length === words.length && words.length > 0 && !finished) {
      setFinished(true);
      onComplete();
    }
  }, [matched, words.length, finished, onComplete]);

  function flip(card: Card) {
    if (locked || finished || opened.includes(card.id) || matched.includes(card.pairId)) return;
    if (opened.length === 1) setLocked(true);
    if (soundEnabled) speakArabic(card.word.arabic);
    setOpened((previous) => [...previous, card.id]);
  }

  function replay() {
    setCards(makeMemoryCards(words)); setOpened([]); setMatched([]); setMoves(0); setLocked(false); setFinished(false);
  }

  if (finished) return <CompletionPanel title="Semua pasangan ditemukan!" detail={`Kamu berhasil mencocokkan ${words.length} pasangan dalam ${moves} langkah.`} onReplay={replay} onBack={onBack} />;

  return <div className="game-board-panel">
    <div className="game-metrics"><div><span>Pasangan ditemukan</span><strong>{matched.length}/{words.length}</strong></div><div><span>Jumlah langkah</span><strong>{moves}</strong></div><div><span>Kartu tersisa</span><strong>{cards.length - matched.length * 2}</strong></div></div>
    <div className={`memory-grid memory-count-${words.length}`}>
      {cards.map((card) => {
        const isOpen = opened.includes(card.id) || matched.includes(card.pairId);
        const isMatched = matched.includes(card.pairId);
        return <button key={card.id} className={`memory-card ${isOpen ? "is-open" : ""} ${isMatched ? "is-matched" : ""}`} onClick={() => flip(card)} aria-label={isOpen ? `${card.word.meaning} ${card.word.arabic}` : "Buka kartu"}>
          {isOpen ? card.side === "picture" ? <><span className="memory-picture">{card.word.emoji}</span><small>{card.word.meaning}</small></> : <><span className="memory-arabic" dir="rtl">{card.word.arabic}</span><small>{card.word.transliteration}</small></> : <span className="memory-card-back">م</span>}
          {isMatched && <span className="matched-check">✓</span>}
        </button>;
      })}
    </div>
    <div className="game-hint"><span>🔊</span> Setiap kartu yang dibuka akan memperdengarkan pelafalan kosakata Arab.</div>
  </div>;
}

function WordSearchGame({ words, size, onComplete, onBack, soundEnabled }: { words: VocabularyWord[]; size: number; onComplete: () => void; onBack: () => void; soundEnabled: boolean }) {
  const [puzzle, setPuzzle] = useState<Puzzle>(() => makeWordSearch(words, size));
  const [start, setStart] = useState<Coordinate | null>(null);
  const [selected, setSelected] = useState<Coordinate[]>([]);
  const [found, setFound] = useState<string[]>([]);
  const [message, setMessage] = useState("Pilih huruf pertama, lalu pilih huruf terakhir dari kata.");
  const [finished, setFinished] = useState(false);

  function selectCell(row: number, col: number) {
    if (finished) return;
    if (!start) {
      setStart([row, col]); setSelected([[row, col]]); setMessage("Sekarang pilih huruf terakhir dari kata."); return;
    }
    const path = getLineCells(start, [row, col]);
    if (!path || path.length < 2) {
      setStart([row, col]); setSelected([[row, col]]); setMessage("Pilih garis lurus, mendatar, tegak, atau diagonal."); return;
    }
    const placement = puzzle.placements.find((item) => !found.includes(item.wordId) && samePath(path, item.cells));
    if (placement) {
      const word = words.find((item) => item.id === placement.wordId);
      const next = [...found, placement.wordId];
      setFound(next); setMessage(`Benar! ${word?.arabic ?? ""} berarti ${word?.meaning ?? ""}.`);
      if (word && soundEnabled) speakArabic(word.arabic);
      if (next.length === words.length) { setFinished(true); onComplete(); }
    } else {
      setMessage("Belum cocok. Coba cari kata lain.");
    }
    setStart(null); setSelected([]);
  }

  function restart() {
    setPuzzle(makeWordSearch(words, size)); setStart(null); setSelected([]); setFound([]); setMessage("Pilih huruf pertama, lalu pilih huruf terakhir dari kata."); setFinished(false);
  }

  if (finished) return <CompletionPanel title="Semua kata ditemukan!" detail={`Kamu berhasil menemukan ${words.length} kosakata Bahasa Arab.`} onReplay={restart} onBack={onBack} />;

  return <div className="game-board-panel wordsearch-panel">
    <div className="game-metrics"><div><span>Kata ditemukan</span><strong>{found.length}/{words.length}</strong></div><div><span>Ukuran kotak</span><strong>{size} × {size}</strong></div><div><span>Sisa kata</span><strong>{words.length - found.length}</strong></div></div>
    <div className="wordsearch-layout">
      <div className="letter-grid-wrap"><div className="letter-grid" style={{ gridTemplateColumns: `repeat(${size}, minmax(0, 1fr))` }} dir="ltr">
        {puzzle.grid.map((row, rowIndex) => row.map((letter, colIndex) => {
          const isSelected = selected.some(([r, c]) => r === rowIndex && c === colIndex);
          const isFound = puzzle.placements.some((placement) => found.includes(placement.wordId) && placement.cells.some(([r, c]) => r === rowIndex && c === colIndex));
          return <button key={`${rowIndex}-${colIndex}`} className={`letter-cell ${isSelected ? "is-selected" : ""} ${isFound ? "is-found" : ""}`} onClick={() => selectCell(rowIndex, colIndex)}>{letter}</button>;
        }))}
      </div></div>
      <aside className="word-list-panel"><div className="word-list-heading"><strong>Temukan kata ini</strong><span>{found.length}/{words.length}</span></div><div className="word-list-items">
        {words.map((word) => <div key={word.id} className={`word-target ${found.includes(word.id) ? "is-found" : ""}`}><span className="word-target-emoji">{word.emoji}</span><div><strong dir="rtl">{word.arabic}</strong><small>{word.meaning}</small></div><span className="word-target-check">{found.includes(word.id) ? "✓" : "○"}</span></div>)}
      </div><div className="wordsearch-message">{message}</div><button className="small-quiet-button" onClick={() => { setStart(null); setSelected([]); }}>Hapus pilihan</button></aside>
    </div>
    <div className="game-hint"><span>🧭</span> Kata dapat tersusun mendatar, tegak, atau diagonal. Pilih huruf awal dan akhir.</div>
  </div>;
}

function ArrangeGame({ words, onComplete, onBack, soundEnabled }: { words: VocabularyWord[]; onComplete: () => void; onBack: () => void; soundEnabled: boolean }) {
  const [index, setIndex] = useState(0);
  const [tiles, setTiles] = useState<LetterTile[]>(() => makeLetterTiles(words[0]?.arabic ?? ""));
  const [selected, setSelected] = useState<number[]>([]);
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [finished, setFinished] = useState(false);
  const current = words[index];
  const answer = selected.map((id) => tiles.find((tile) => tile.id === id)?.letter ?? "").join("");

  useEffect(() => {
    if (!current) return;
    setTiles(makeLetterTiles(current.arabic)); setSelected([]); setResult(null);
  }, [index, current]);

  function chooseTile(id: number) {
    if (selected.includes(id) || result === "correct") return;
    setSelected((previous) => [...previous, id]); setResult(null);
  }

  function removeTile(id: number) {
    if (result === "correct") return;
    setSelected((previous) => previous.filter((value) => value !== id)); setResult(null);
  }

  function checkAnswer() {
    if (answer === current.arabic) {
      setResult("correct");
      if (soundEnabled) speakArabic(current.arabic);
    } else {
      setResult("wrong");
    }
  }

  function nextWord() {
    if (index + 1 < words.length) setIndex((value) => value + 1);
    else { setFinished(true); onComplete(); }
  }

  function replay() {
    setIndex(0); setTiles(makeLetterTiles(words[0]?.arabic ?? "")); setSelected([]); setResult(null); setFinished(false);
  }

  if (finished) return <CompletionPanel title="Susunan hurufmu tepat!" detail={`Kamu berhasil menyusun ${words.length} kosakata Bahasa Arab.`} onReplay={replay} onBack={onBack} />;

  return <div className="game-board-panel arrange-panel">
    <div className="game-metrics"><div><span>Kosakata</span><strong>{index + 1}/{words.length}</strong></div><div><span>Huruf tersusun</span><strong>{selected.length}/{Array.from(current.arabic).length}</strong></div><div><span>Level</span><strong>{index < 2 ? "A1" : "A2"}</strong></div></div>
    <div className="arrange-challenge">
      <div className="arrange-picture"><span>{current.emoji}</span><small>{current.meaning}</small><button onClick={() => speakArabic(current.arabic)} disabled={!soundEnabled}>🔊 Dengarkan</button></div>
      <div className="arrange-workspace">
        <span className="mini-label">SUSUN HURUF MENJADI KATA</span>
        <div className={`answer-slots ${result === "correct" ? "answer-correct" : result === "wrong" ? "answer-wrong" : ""}`} dir="rtl">
          {selected.map((id) => {
            const tile = tiles.find((item) => item.id === id);
            return <button key={`slot-${id}`} className="answer-slot has-letter" onClick={() => removeTile(id)} aria-label="Hapus huruf dari jawaban">{tile?.letter}</button>;
          })}
          {Array.from({ length: tiles.length - selected.length }, (_, index) => <span key={`empty-slot-${index}`} className="answer-slot" />)}
        </div>
        <div className="letter-tiles" dir="rtl">
          {tiles.map((tile) => <button key={tile.id} className={`letter-tile ${selected.includes(tile.id) ? "is-used" : ""}`} onClick={() => chooseTile(tile.id)} disabled={selected.includes(tile.id)}>{tile.letter}</button>)}
        </div>
        {result === "wrong" && <p className="answer-feedback wrong-feedback">Belum tepat. Periksa kembali urutan hurufnya.</p>}
        {result === "correct" && <p className="answer-feedback correct-feedback">✓ Benar! {current.arabic} berarti {current.meaning}.</p>}
        <div className="arrange-actions">
          {result === "correct" ? <button className="primary-button" onClick={nextWord}>{index + 1 === words.length ? "Selesaikan misi" : "Kata berikutnya"} <span>↗</span></button> : <><button className="secondary-button" onClick={() => { setSelected([]); setResult(null); }}>Ulangi</button><button className="primary-button" onClick={checkAnswer} disabled={selected.length !== tiles.length}>Periksa jawaban <span>✓</span></button></>}
        </div>
      </div>
    </div>
  </div>;
}

function ConversationGame({ steps, onComplete, onBack, soundEnabled }: { steps: ConversationStep[]; onComplete: () => void; onBack: () => void; soundEnabled: boolean }) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [finished, setFinished] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [optionOrder, setOptionOrder] = useState(() => shuffle(steps[0].options.map((answer, originalIndex) => ({ answer, isCorrect: originalIndex === steps[0].correctIndex }))));
  const step = steps[index];
  const correctOptionIndex = optionOrder.findIndex((item) => item.isCorrect);
  const isCorrect = selected === correctOptionIndex;

  function chooseOption(optionIndex: number) {
    if (answered) return;
    setSelected(optionIndex); setAnswered(true);
    if (soundEnabled) speakArabic(optionOrder[optionIndex].answer.arabic);
    if (optionIndex !== correctOptionIndex) setMistakes((value) => value + 1);
  }

  function continueConversation() {
    if (index + 1 < steps.length) {
      const nextIndex = index + 1;
      const nextStep = steps[nextIndex];
      setIndex(nextIndex);
      setOptionOrder(shuffle(nextStep.options.map((answer, originalIndex) => ({ answer, isCorrect: originalIndex === nextStep.correctIndex }))));
      setSelected(null);
      setAnswered(false);
    } else {
      setFinished(true);
      onComplete();
    }
  }

  function replay() {
    const firstStep = steps[0];
    setIndex(0);
    setOptionOrder(shuffle(firstStep.options.map((answer, originalIndex) => ({ answer, isCorrect: originalIndex === firstStep.correctIndex }))));
    setSelected(null); setAnswered(false); setFinished(false); setMistakes(0);
  }

  if (finished) return <CompletionPanel title="Percakapan selesai!" detail={`Kamu menyelesaikan ${steps.length} bagian percakapan${mistakes ? ` dengan ${mistakes} jawaban yang perlu diperbaiki` : " dengan semua jawaban tepat"}.`} onReplay={replay} onBack={onBack} />;

  const correctAnswer = optionOrder[correctOptionIndex]?.answer;
  return <div className="game-board-panel conversation-panel">
    <div className="game-metrics"><div><span>Bagian percakapan</span><strong>{index + 1}/{steps.length}</strong></div><div><span>Jawaban perlu diperbaiki</span><strong>{mistakes}</strong></div><div><span>Situasi</span><strong>A1–A2</strong></div></div>
    <div className="conversation-scene">
      <div className="conversation-characters"><div className="character-card"><span className="character-avatar ahmad-avatar">👦🏻</span><strong>Ahmad</strong><small>Teman sekolahmu</small></div><div className="conversation-scene-label">LET'S TALK IN ARABIC</div><div className="character-card"><span className="character-avatar you-avatar">🧑🏻</span><strong>Kamu</strong><small>Teman Ahmad</small></div></div>
      <div className="dialogue-track">
        <div className="dialogue-row npc-row"><span className="dialogue-avatar">👦🏻</span><div className="dialogue-bubble"><div className="bubble-top"><strong>Ahmad</strong><button onClick={() => speakArabic(step.prompt)} disabled={!soundEnabled}>🔊</button></div><p className="arabic-dialogue" dir="rtl">{step.prompt}</p><small>{step.promptMeaning}</small></div></div>
        {answered && selected !== null && <div className="dialogue-row player-row"><div className={`dialogue-bubble player-bubble ${isCorrect ? "bubble-correct" : "bubble-wrong"}`}><div className="bubble-top"><strong>Kamu</strong><span>{isCorrect ? "✓" : "×"}</span></div><p className="arabic-dialogue" dir="rtl">{optionOrder[selected].answer.arabic}</p><small>{optionOrder[selected].answer.meaning}</small></div><span className="dialogue-avatar">🧑🏻</span></div>}
        {answered && isCorrect && <div className="dialogue-row npc-row reply-row"><span className="dialogue-avatar">👦🏻</span><div className="dialogue-bubble"><div className="bubble-top"><strong>Ahmad</strong><button onClick={() => speakArabic(step.reply)} disabled={!soundEnabled}>🔊</button></div><p className="arabic-dialogue" dir="rtl">{step.reply}</p><small>{step.replyMeaning}</small></div></div>}
      </div>
    </div>
    <div className="conversation-question"><span className="mini-label">PILIH JAWABAN YANG PALING TEPAT</span><h3>Bagaimana kamu menjawab Ahmad?</h3>
      <div className="conversation-options">
        {optionOrder.map(({ answer }, optionIndex) => <button key={`${index}-${optionIndex}`} className={`conversation-option ${selected === optionIndex ? (optionIndex === correctOptionIndex ? "option-correct" : "option-wrong") : ""} ${answered && optionIndex === correctOptionIndex ? "show-correct" : ""}`} onClick={() => chooseOption(optionIndex)} disabled={answered}>
          <span className="option-letter">{String.fromCharCode(65 + optionIndex)}</span><div className="option-copy"><strong className="arabic-option" dir="rtl">{answer.arabic}</strong><span>{answer.transliteration}</span><small>{answer.meaning}</small></div><span className="option-indicator">{selected === optionIndex ? (optionIndex === correctOptionIndex ? "✓" : "×") : answered && optionIndex === correctOptionIndex ? "✓" : ""}</span>
        </button>)}
      </div>
      {answered && <div className={`conversation-feedback ${isCorrect ? "feedback-correct" : "feedback-wrong"}`}><strong>{isCorrect ? "Jawaban tepat!" : "Belum tepat."}</strong><span>{isCorrect ? "Ahmad memahami jawabanmu. Lanjutkan percakapan!" : `Jawaban yang tepat: ${correctAnswer?.arabic} (${correctAnswer?.meaning}). Perhatikan kembali sebelum melanjutkan.`}</span><button className="primary-button" onClick={continueConversation}>{index + 1 === steps.length ? "Selesaikan percakapan" : "Lanjutkan percakapan"} <span>↗</span></button></div>}
    </div>
  </div>;
}
