import { createSortedRowModel, rowSortingFeature, tableFeatures } from "@tanstack/react-table";

// @tanstack/react-table v9 registers features (and the row-model factories
// they need) explicitly instead of importing hook-shaped helpers like
// `getSortedRowModel()`. Only sorting is used here — no filtering, grouping,
// pagination, etc. — so that's the only feature registered.
export const dashboardTableFeatures = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
