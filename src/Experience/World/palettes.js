// Shared color vocabulary for the data layers and the UI legends.
// Categorical hues are fixed-order and never cycled; the carbon ramp is a
// clean→dirty diverging pair with a neutral midpoint pinned to the world
// average grid intensity.

export const OPERATOR_CLASSES = [
  { key: "h", label: "hyperscaler", color: "#e8a34c" },
  { key: "c", label: "colocation", color: "#7fc9a6" },
  { key: "t", label: "telco", color: "#7fa6d9" },
  { key: "o", label: "other", color: "#66738a" },
];

export const CARBON_RAMP = {
  clean: "#6fbfa8", // low gCO2/kWh
  mid: "#8a8578", // world average
  dirty: "#d96f4a", // high gCO2/kWh
};

export const CLOUD_PROVIDERS = [
  { key: "aws", label: "AWS", color: "#e8883a" },
  { key: "azure", label: "Azure", color: "#6f9fd8" },
  { key: "gcp", label: "GCP", color: "#8ac97f" },
];

export const CABLE_COLOR = "#54749c";
