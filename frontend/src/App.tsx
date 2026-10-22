import { useState } from "react";
import { Box, Tab, Tabs, Typography } from "@mui/material";
import { HomeDashboard } from "./dashboards/HomeDashboard";
import { BowlingDashboard } from "./dashboards/BowlingDashboard";
import { BattingDashboard } from "./dashboards/BattingDashboard";
import { MatchesDashboard } from "./dashboards/MatchesDashboard";
import { ComparisonDashboard } from "./dashboards/ComparisonDashboard";
import { DataQualityDashboard } from "./dashboards/DataQualityDashboard";
import { FORMAT_TIERS } from "./formatTiers";
import type { DeliveryFilters } from "./types/cricket";
import { colors } from "./theme";

type Section = "home" | "data-quality" | string; // or a format-tier key from FORMAT_TIERS
type SubSection = "bowling" | "batting" | "matches" | "compare";

/**
 * Two-level navigation: Home (a summary across all three format
 * tiers, never blended - see HomeDashboard.tsx) sits above three
 * format-tier sections (First Class / 50-Over / T20), each of
 * which carries its own Bowling/Batting/Matches/Compare sub-tabs -
 * the full deep-dive toolset, but always scoped to one tier's worth
 * of matches. Plain component state rather than a router: still no
 * sub-route worth bookmarking yet.
 */
function App() {
  const [section, setSection] = useState<Section>("home");
  const [subSection, setSubSection] = useState<SubSection>("bowling");

  const activeTier = FORMAT_TIERS.find((t) => t.key === section);
  const lockedFilters: DeliveryFilters | undefined = activeTier
    ? { equals: { format_tier: [activeTier.key] } }
    : undefined;

  const selectTier = (tierKey: string) => {
    setSection(tierKey);
    setSubSection("bowling");
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
          value={section}
          onChange={(_, value: Section) => setSection(value)}
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
            onChange={(_, value: SubSection) => setSubSection(value)}
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
