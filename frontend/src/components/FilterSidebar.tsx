import { Autocomplete, Box, Slider, TextField, Typography } from "@mui/material";
import { labelFor } from "../dimensions";
import type { DeliveryFilters, FilterOptions } from "../types/cricket";

interface FilterSidebarProps {
  title?: string;
  options: FilterOptions | null;
  dimensions: string[];
  filters: DeliveryFilters;
  onChange: (next: DeliveryFilters) => void;
  overMinKey?: string;
  overMaxKey?: string;
  overLabel?: string;
  showDateRange?: boolean;
}

/**
 * One Autocomplete per dimension the caller passes in - the sidebar
 * itself has no idea whether it's filtering bowling or batting, or
 * how many dimensions there are. Adding a new filterable column is a
 * backend change plus one entry in dimensions.ts, not a new control
 * hand-wired here (see app/services/filters.py for why the backend
 * is generic the same way).
 */
export function FilterSidebar({
  title,
  options,
  dimensions,
  filters,
  onChange,
  overMinKey = "over_min",
  overMaxKey = "over_max",
  overLabel = "Over Range",
  showDateRange = true,
}: FilterSidebarProps) {
  if (!options) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="body2" color="text.secondary">
          Loading filters…
        </Typography>
      </Box>
    );
  }

  const overMin = Number(options[overMinKey] ?? 0);
  const overMax = Number(options[overMaxKey] ?? 0);
  const overRange: [number, number] = [filters.over_min ?? overMin, filters.over_max ?? overMax];

  const setEquals = (column: string, values: string[]) => {
    const nextEquals = { ...filters.equals };
    if (values.length) {
      nextEquals[column] = values;
    } else {
      delete nextEquals[column];
    }
    onChange({ ...filters, equals: nextEquals });
  };

  return (
    <Box
      sx={{
        p: 3,
        display: "flex",
        flexDirection: "column",
        gap: 3,
        height: "100%",
        overflowY: "auto",
      }}
    >
      {title && (
        <Typography variant="overline" sx={{ color: "text.secondary", letterSpacing: 2 }}>
          {title}
        </Typography>
      )}

      {showDateRange && (
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Date Range
          </Typography>
          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              type="date"
              size="small"
              label="From"
              slotProps={{ inputLabel: { shrink: true } }}
              value={filters.date_from ?? ""}
              onChange={(e) => onChange({ ...filters, date_from: e.target.value || undefined })}
              fullWidth
            />
            <TextField
              type="date"
              size="small"
              label="To"
              slotProps={{ inputLabel: { shrink: true } }}
              value={filters.date_to ?? ""}
              onChange={(e) => onChange({ ...filters, date_to: e.target.value || undefined })}
              fullWidth
            />
          </Box>
        </Box>
      )}

      {dimensions.map((column) => {
        const columnOptions = (options[column] as string[] | undefined) ?? [];
        if (columnOptions.length === 0) return null;
        return (
          <Autocomplete
            key={column}
            multiple
            size="small"
            options={columnOptions}
            value={filters.equals[column] ?? []}
            onChange={(_, value) => setEquals(column, value)}
            renderInput={(params) => <TextField {...params} label={labelFor(column)} />}
          />
        );
      })}

      {overMax > overMin && (
        <Box>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            {overLabel}: {overRange[0]} – {overRange[1]}
          </Typography>
          <Slider
            size="small"
            min={overMin}
            max={overMax}
            value={overRange}
            onChange={(_, value) => {
              const [min, max] = value as number[];
              onChange({ ...filters, over_min: min, over_max: max });
            }}
            valueLabelDisplay="auto"
          />
        </Box>
      )}
    </Box>
  );
}
