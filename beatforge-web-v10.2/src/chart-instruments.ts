export type ChartInstrument = 'mix' | 'vocals' | 'drums' | 'bass' | 'melody';

const names: Record<ChartInstrument, string> = {
  mix: 'Full mix',
  vocals: 'Vocals',
  drums: 'Drums',
  bass: 'Bass',
  melody: 'Melody',
};

export function instrumentLabel(value: string | null | undefined): string {
  return names[value as ChartInstrument] || names.mix;
}

/** Ask the home page to load an exact chart ID, even if it is not in the first page of Community results. */
export function loadChartById(chartId: string): Promise<boolean> {
  return new Promise(resolve => {
    const timeout = window.setTimeout(() => resolve(false), 10000);
    window.dispatchEvent(new CustomEvent('beatforge:load-chart', {
      detail: {chartId, resolve: (loaded: boolean) => {window.clearTimeout(timeout);resolve(loaded)}},
    }));
  });
}
