type Report = {
  dependencies: { packageName: string; actualVersion: string; expectedVersionOrRange: string }[];
};

export function classify(report: Report): { errors: string[]; warnings: string[] };
