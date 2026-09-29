import { createTheme } from "@mui/material/styles";

/**
 * Design language: a stadium scoreboard, not a generic admin panel.
 * Deep turf-shadow greens, a wicket-gold accent reserved for the
 * numbers that matter most, and a condensed display face (Oswald)
 * for anything numeric - it should feel legible from a distance,
 * the way a real scoreboard does.
 */
export const colors = {
  bgDeep: "#0D1512",
  surface: "#16211C",
  surfaceAlt: "#1E2C25",
  border: "#2A3B31",
  gold: "#C9A961",
  turfGreen: "#5C9257",
  clayRed: "#BD5B42",
  chalk: "#EDEAE0",
  chalkMuted: "#8FA096",
};

export const theme = createTheme({
  palette: {
    mode: "dark",
    background: {
      default: colors.bgDeep,
      paper: colors.surface,
    },
    primary: {
      main: colors.gold,
    },
    success: {
      main: colors.turfGreen,
    },
    error: {
      main: colors.clayRed,
    },
    text: {
      primary: colors.chalk,
      secondary: colors.chalkMuted,
    },
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    h1: { fontFamily: '"Oswald", sans-serif' },
    h2: { fontFamily: '"Oswald", sans-serif' },
    h3: { fontFamily: '"Oswald", sans-serif' },
    h4: { fontFamily: '"Oswald", sans-serif' },
    h5: { fontFamily: '"Oswald", sans-serif' },
    h6: { fontFamily: '"Oswald", sans-serif' },
  },
  shape: {
    borderRadius: 6,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
          border: `1px solid ${colors.border}`,
        },
      },
    },
  },
});
