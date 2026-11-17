import { useEffect } from "react";
import { HashRouter, Routes, Route, useNavigate, useParams } from "react-router-dom";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import { HomeDashboard } from "./dashboards/HomeDashboard";
import { BowlingDashboard } from "./dashboards/BowlingDashboard";
import { BattingDashboard } from "./dashboards/BattingDashboard";
import { MatchesDashboard } from "./dashboards/MatchesDashboard";
import { ComparisonDashboard } from "./dashboards/ComparisonDashboard";
import { DataQualityDashboard } from "./dashboards/DataQualityDashboard";
import { FORMAT_TIERS, tierForSlug } from "./formatTiers";
import type { DeliveryFilters } from "./types/cricket";
import { colors } from "./theme";

type SubSection = "bowling" | "batting" | "matches" | "compare";
const DEFAULT_SUB_SECTION: SubSection = "bowling";
const SUB_SECTIONS: SubSection[] = ["bowling", "batting", "matches", "compare"];

// Remembers which sub-tab you were last on for each format tier, so
// flipping Home -> First Class -> Home -> First Class again lands you
// back where you left off instead of always resetting to Bowling. A
// per-viewer convenience, not data that needs to survive anywhere
// else - safe to lose silently in a private window.
const lastSubSectionKey = (tierKey: string) => `cricket-analytics:last-subsection:${tierKey}`;

function rememberSubSection(tierKey: string, subSection: SubSection) {
  try {
    localStorage.setItem(lastSubSectionKey(tierKey), subSection);
  } catch {
    // ignore - private browsing / blocked storage, not worth surfacing
  }
}

function lastSubSection(tierKey: string): SubSection {
  try {
    const stored = localStorage.getItem(lastSubSectionKey(tierKey));
    if (stored && SUB_SECTIONS.includes(stored as SubSection)) return stored as SubSection;
  } catch {
    // ignore - same reasoning as rememberSubSection
  }
  return DEFAULT_SUB_SECTION;
}

/**
 * Two-level navigation: Home (a summary across all three format
 * tiers, never blended - see HomeDashboard.tsx) sits above three
 * format-tier sections (First Class / 50-Over / T20), each of
 * which carries its own Bowling/Batting/Matches/Compare sub-tabs -
 * the full deep-dive toolset, but always scoped to one tier's worth
 * of matches.
 *
 * Backed by a HashRouter (routes look like /#/first-class/bowling)
 * rather than plain component state or a path-based BrowserRouter:
 * the backend serves the built frontend via Starlette's
 * StaticFiles(html=True) (see main.py), which has no catch-all
 * fallback for an arbitrary path - a real browser-history URL would
 * 404 on refresh unless the backend grew its own SPA-fallback route.
 * A hash route needs none of that: the server only ever sees "/",
 * and the part after "#" is resolved entirely client-side - so
 * refresh, back/forward, and sharing a link to a specific tier/tab
 * all just work, with zero backend risk.
 */
function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Shell section="home" />} />
        <Route path="/manage-data" element={<Shell section="data-quality" />} />
        <Route path="/:tierSlug" element={<Shell section="tier" />} />
        <Route path="/:tierSlug/:subSection" element={<Shell section="tier" />} />
      </Routes>
    </HashRouter>
  );
}

function Shell({ section }: { section: "home" | "data-quality" | "tier" }) {
  const navigate = useNavigate();
  const params = useParams<{ tierSlug?: string; subSection?: string }>();
  const activeTier = section === "tier" ? tierForSlug(params.tierSlug) : undefined;
  const subSection = (params.subSection as SubSection | undefined) ?? DEFAULT_SUB_SECTION;

  // /:tierSlug alone (no sub-tab segment) - land on whichever sub-tab
  // was last visited for this tier rather than always forcing Bowling.
  useEffect(() => {
    if (activeTier && !params.subSection) {
      navigate(`/${activeTier.slug}/${lastSubSection(activeTier.key)}`, { replace: true });
    }
  }, [activeTier, params.subSection, navigate]);

  // A stale or hand-typed URL with a slug that isn't one of the three
  // known tiers (e.g. a format renamed since the link was shared) -
  // back to Home rather than a blank page under the header.
  useEffect(() => {
    if (section === "tier" && !activeTier) {
      navigate("/", { replace: true });
    }
  }, [section, activeTier, navigate]);

  const lockedFilters: DeliveryFilters | undefined = activeTier
    ? { equals: { format_tier: [activeTier.key] } }
    : undefined;

  const selectTier = (tierKey: string) => {
    const tier = FORMAT_TIERS.find((t) => t.key === tierKey);
    if (tier) navigate(`/${tier.slug}/${lastSubSection(tier.key)}`);
  };

  const selectSubSection = (next: SubSection) => {
    if (!activeTier) return;
    rememberSubSection(activeTier.key, next);
    navigate(`/${activeTier.slug}/${next}`);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh", bgcolor: "background.default" }}>
      <Box sx={{ borderBottom: `1px solid ${colors.border}`, bgcolor: colors.surface, px: 4, pt: 3 }}>
        <Typography variant="overline" sx={{ color: colors.chalkMuted, letterSpacing: 3 }}>
          Cricket Performance Analytics
        </Typography>
        <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
          Thomas Mayes
        </Typography>
        <Tabs
          value={activeTier ? activeTier.key : section}
          onChange={(_, value: string) => {
            if (value === "home") navigate("/");
            else if (value === "data-quality") navigate("/manage-data");
            else selectTier(value);
          }}
          textColor="inherit"
          variant="scrollable"
          scrollButtons="auto"
          allowScrollButtonsMobile
          sx={{ "& .MuiTabs-indicator": { backgroundColor: colors.gold } }}
        >
          <Tab value="home" label="Home" sx={{ fontWeight: 600 }} />
          {FORMAT_TIERS.map((tier) => (
            <Tab key={tier.key} value={tier.key} label={tier.label} sx={{ fontWeight: 600 }} />
          ))}
          <Tab value="data-quality" label="Manage Data" sx={{ fontWeight: 600 }} />
        </Tabs>

        {activeTier && (
          <Tabs
            value={subSection}
            onChange={(_, value: SubSection) => selectSubSection(value)}
            textColor="inherit"
            variant="scrollable"
            scrollButtons="auto"
            allowScrollButtonsMobile
            sx={{
              minHeight: 36,
              "& .MuiTabs-indicator": { backgroundColor: colors.turfGreen },
              "& .MuiTab-root": { minHeight: 36, py: 0.5 },
            }}
          >
            <Tab value="bowling" label="Bowling" />
            <Tab value="batting" label="Batting" />
            <Tab value="matches" label="Matches" />
            <Tab value="compare" label="Compare" />
          </Tabs>
        )}
      </Box>

      {section === "home" && <HomeDashboard onSelectTier={selectTier} />}
      {section === "data-quality" && <DataQualityDashboard />}

      {activeTier && (
        <>
          {subSection === "bowling" && <BowlingDashboard key={activeTier.key} lockedFilters={lockedFilters} />}
          {subSection === "batting" && <BattingDashboard key={activeTier.key} lockedFilters={lockedFilters} />}
          {subSection === "matches" && <MatchesDashboard key={activeTier.key} lockedFilters={lockedFilters} />}
          {subSection === "compare" && <ComparisonDashboard key={activeTier.key} lockedFilters={lockedFilters} />}
        </>
      )}
    </Box>
  );
}

export default App;
