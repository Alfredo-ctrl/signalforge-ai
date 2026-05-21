const scenarios = {
  api: {
    title: "API latency platform",
    subtitle: "Synthetic signal with deployment spikes, traffic seasonality, and recovery patterns.",
    unit: "ms",
    base: 180,
    amplitude: 42,
    trend: 0.026,
    anomalyBias: 1,
    causes: {
      up: ["Deployment regression", "Cache saturation", "Database connection pressure"],
      down: ["Autoscaling recovery", "Cache warmup", "Traffic dip"]
    }
  },
  checkout: {
    title: "Checkout revenue stream",
    subtitle: "Revenue telemetry with campaign lifts, payment dropouts, and demand cycles.",
    unit: "USD",
    base: 4300,
    amplitude: 620,
    trend: 2.8,
    anomalyBias: -1,
    causes: {
      up: ["Campaign overperformance", "Marketplace demand shock", "Premium basket mix"],
      down: ["Payment processor degradation", "Inventory constraint", "Fraud rule false positives"]
    }
  },
  gpu: {
    title: "GPU cluster thermals",
    subtitle: "Infrastructure profile with thermal spikes, load waves, and cooling recovery.",
    unit: "C",
    base: 64,
    amplitude: 7,
    trend: 0.008,
    anomalyBias: 1,
    causes: {
      up: ["Thermal throttling risk", "Batch job saturation", "Cooling loop imbalance"],
      down: ["Workload drain", "Power cap enforcement", "Maintenance window"]
    }
  },
  grid: {
    title: "Smart grid demand",
    subtitle: "Demand curve with seasonal load, stress events, and recovery signatures.",
    unit: "MW",
    base: 980,
    amplitude: 190,
    trend: 0.24,
    anomalyBias: 1,
    causes: {
      up: ["Demand surge", "Weather-driven load", "Regional failover"],
      down: ["Demand response event", "Metering dropout", "Distributed generation offset"]
    }
  },
  custom: {
    title: "Custom CSV signal",
    subtitle: "Imported local data analyzed with the same robust anomaly pipeline.",
    unit: "value",
    base: 100,
    amplitude: 20,
    trend: 0,
    anomalyBias: 1,
    causes: {
      up: ["Unexpected positive deviation", "External load change", "Measurement jump"],
      down: ["Unexpected negative deviation", "Data loss window", "Suppressed activity"]
    }
  }
};

const el = {
  heroScore: document.getElementById("hero-score"),
  heroSummary: document.getElementById("hero-summary"),
  scenario: document.getElementById("scenario-select"),
  sensitivity: document.getElementById("sensitivity-input"),
  seasonality: document.getElementById("seasonality-input"),
  smooth: document.getElementById("smooth-input"),
  noise: document.getElementById("noise-input"),
  sensitivityOut: document.getElementById("sensitivity-output"),
  seasonalityOut: document.getElementById("seasonality-output"),
  smoothOut: document.getElementById("smooth-output"),
  noiseOut: document.getElementById("noise-output"),
  generate: document.getElementById("generate-btn"),
  analyze: document.getElementById("analyze-btn"),
  import: document.getElementById("import-btn"),
  csvInput: document.getElementById("csv-input"),
  csvFile: document.getElementById("csv-file"),
  save: document.getElementById("save-btn"),
  load: document.getElementById("load-btn"),
  exportJson: document.getElementById("export-json-btn"),
  exportCsv: document.getElementById("export-csv-btn"),
  stream: document.getElementById("stream-btn"),
  chartTitle: document.getElementById("chart-title"),
  chartSubtitle: document.getElementById("chart-subtitle"),
  pointCount: document.getElementById("point-count-label"),
  anomalyCount: document.getElementById("anomaly-count"),
  anomalyRate: document.getElementById("anomaly-rate"),
  peakSeverity: document.getElementById("peak-severity"),
  peakLabel: document.getElementById("peak-label"),
  forecastDrift: document.getElementById("forecast-drift"),
  forecastLabel: document.getElementById("forecast-label"),
  bandWidth: document.getElementById("band-width"),
  bandLabel: document.getElementById("band-label"),
  incidentCount: document.getElementById("incident-count"),
  incidentList: document.getElementById("incident-list"),
  briefMode: document.getElementById("brief-mode"),
  briefBody: document.getElementById("brief-body"),
  canvas: document.getElementById("signal-canvas"),
  tooltip: document.getElementById("chart-tooltip"),
  toast: document.getElementById("toast")
};

const state = {
  series: [],
  analysis: null,
  chartPoints: [],
  streamIndex: null,
  streamTimer: null,
  seed: Date.now()
};

const ctx = el.canvas.getContext("2d");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function formatNumber(value, digits = 0) {
  if (!Number.isFinite(value)) return "--";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function deviation(values) {
  const center = median(values);
  const absolute = values.map(value => Math.abs(value - center));
  const spread = median(absolute) * 1.4826;
  if (spread > 0.000001) return spread;
  const avg = mean(values);
  const variance = mean(values.map(value => (value - avg) ** 2));
  return Math.sqrt(variance) || 1;
}

function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(random) {
  const u = Math.max(random(), 0.000001);
  const v = Math.max(random(), 0.000001);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function settings() {
  return {
    scenario: el.scenario.value,
    sensitivity: Number(el.sensitivity.value),
    seasonality: Number(el.seasonality.value),
    smooth: Number(el.smooth.value),
    noise: Number(el.noise.value)
  };
}

function syncOutputs() {
  el.sensitivityOut.value = el.sensitivity.value;
  el.seasonalityOut.value = el.seasonality.value;
  el.smoothOut.value = el.smooth.value;
  el.noiseOut.value = el.noise.value;
}

function scenarioConfig() {
  return scenarios[el.scenario.value] || scenarios.api;
}

function timestampAt(index) {
  const start = new Date("2026-05-20T00:00:00");
  start.setMinutes(start.getMinutes() + index * 5);
  return start.toISOString().slice(0, 16).replace("T", " ");
}

function generateSeries() {
  stopStream();
  const config = scenarioConfig();
  const opts = settings();
  const random = createRandom(Date.now() + state.seed + opts.noise * 97);
  const length = 288;
  const period = opts.seasonality;
  const volatility = config.amplitude * (0.08 + opts.noise / 180);
  const anomalyCount = 5 + Math.floor(opts.noise / 18);
  const events = [];

  for (let i = 0; i < anomalyCount; i += 1) {
    const start = 18 + Math.floor(random() * (length - 50));
    const duration = 2 + Math.floor(random() * 9);
    const sign = random() > 0.38 ? config.anomalyBias : -config.anomalyBias;
    const magnitude = (1.4 + random() * 2.8) * config.amplitude * sign;
    events.push({ start, end: start + duration, magnitude });
  }

  state.series = Array.from({ length }, (_, index) => {
    const cycle = Math.sin((index / period) * Math.PI * 2);
    const harmonic = Math.sin((index / (period / 2)) * Math.PI * 2 + 1.25) * 0.32;
    const drift = index * config.trend;
    const noise = gaussian(random) * volatility;
    const eventImpact = events.reduce((sum, event) => {
      if (index < event.start || index > event.end) return sum;
      const center = (event.start + event.end) / 2;
      const width = Math.max(1, (event.end - event.start) / 2);
      return sum + event.magnitude * Math.exp(-((index - center) ** 2) / (2 * width ** 2));
    }, 0);
    const value = Math.max(0, config.base + config.amplitude * cycle + config.amplitude * harmonic + drift + noise + eventImpact);
    return {
      index,
      timestamp: timestampAt(index),
      value: round(value, 3)
    };
  });

  state.seed += 1;
  analyzeSeries();
  showToast("Generated a fresh telemetry scenario.");
}

function parseCsv(text) {
  const rows = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const data = [];

  rows.forEach((row, rowIndex) => {
    const parts = row.split(/,|;|\t/).map(part => part.trim()).filter(part => part.length);
    if (!parts.length) return;
    const numericIndex = [...parts].reverse().findIndex(part => Number.isFinite(Number(part)));
    if (numericIndex === -1) return;
    const actualIndex = parts.length - 1 - numericIndex;
    const value = Number(parts[actualIndex]);
    if (!Number.isFinite(value)) return;
    const timestamp = actualIndex > 0 ? parts.slice(0, actualIndex).join(" ") : timestampAt(data.length);
    if (rowIndex === 0 && /time|date|value|metric/i.test(row) && data.length === 0) return;
    data.push({
      index: data.length,
      timestamp,
      value
    });
  });

  return data;
}

function importCsv() {
  stopStream();
  const parsed = parseCsv(el.csvInput.value);
  if (parsed.length < 12) {
    showToast("Import needs at least 12 numeric rows.");
    return;
  }
  el.scenario.value = "custom";
  state.series = parsed.map((point, index) => ({ ...point, index }));
  analyzeSeries();
  showToast(`Imported ${parsed.length} data points.`);
}

function exponentialBaseline(values, smooth) {
  const alpha = clamp((100 - smooth) / 105, 0.04, 0.82);
  const baseline = [];
  values.forEach((value, index) => {
    baseline[index] = index === 0 ? value : alpha * value + (1 - alpha) * baseline[index - 1];
  });
  return baseline;
}

function seasonalComponents(values, trend, period) {
  const buckets = Array.from({ length: period }, () => []);
  values.forEach((value, index) => {
    buckets[index % period].push(value - trend[index]);
  });
  return buckets.map(bucket => median(bucket));
}

function buildForecast(values, trend, seasonal, period, horizon) {
  const last = values.length - 1;
  const lookback = Math.min(period, last);
  const slope = lookback > 0 ? (trend[last] - trend[last - lookback]) / lookback : 0;
  return Array.from({ length: horizon }, (_, step) => {
    const index = values.length + step;
    const value = trend[last] + slope * (step + 1) + seasonal[index % period];
    return {
      index,
      timestamp: timestampAt(index),
      value: Math.max(0, round(value, 3))
    };
  });
}

function analyzeSeries() {
  if (!state.series.length) generateSeries();
  stopStream();
  const opts = settings();
  const values = state.series.map(point => Number(point.value)).filter(Number.isFinite);
  const period = clamp(Math.min(opts.seasonality, Math.floor(values.length / 2)), 4, 96);
  const trend = exponentialBaseline(values, opts.smooth);
  const seasonal = seasonalComponents(values, trend, period);
  const baseline = values.map((_, index) => trend[index] + seasonal[index % period] * 0.86);
  const residuals = values.map((value, index) => value - baseline[index]);
  const spread = deviation(residuals);
  const threshold = 5.35 - opts.sensitivity * 0.034;
  const scores = residuals.map(value => Math.abs(value) / spread);
  const anomalies = scores.map((score, index) => ({
    index,
    score,
    residual: residuals[index],
    value: values[index],
    timestamp: state.series[index].timestamp,
    direction: residuals[index] >= 0 ? "up" : "down",
    isAnomaly: score >= threshold
  })).filter(item => item.isAnomaly);
  const confidence = threshold * spread;
  const incidents = groupIncidents(anomalies, threshold);
  const horizon = Math.min(48, Math.max(16, period));
  const forecast = buildForecast(values, trend, seasonal, period, horizon);
  const forecastMean = mean(forecast.map(point => point.value));
  const recentMean = mean(values.slice(Math.max(0, values.length - horizon)));
  const drift = recentMean ? ((forecastMean - recentMean) / Math.abs(recentMean)) * 100 : 0;
  const excess = anomalies.length ? mean(anomalies.map(item => Math.max(0, item.score - threshold))) : 0;
  const anomalyRate = anomalies.length / values.length;
  const health = clamp(100 - anomalyRate * 520 - excess * 8, 0, 100);

  state.analysis = {
    values,
    trend,
    seasonal,
    baseline,
    residuals,
    spread,
    threshold,
    scores,
    anomalies,
    incidents,
    confidence,
    forecast,
    drift,
    health,
    period
  };

  renderAll();
}

function groupIncidents(anomalies, threshold) {
  const config = scenarioConfig();
  const groups = [];
  let current = null;

  anomalies.forEach(item => {
    if (!current || item.index - current.end > 3) {
      current = { start: item.index, end: item.index, items: [item] };
      groups.push(current);
      return;
    }
    current.end = item.index;
    current.items.push(item);
  });

  return groups.map((group, order) => {
    const peak = group.items.reduce((best, item) => item.score > best.score ? item : best, group.items[0]);
    const directionScore = mean(group.items.map(item => item.residual));
    const direction = directionScore >= 0 ? "up" : "down";
    const peakScore = peak.score;
    const severity = peakScore >= threshold * 1.78 ? "high" : peakScore >= threshold * 1.26 ? "medium" : "low";
    const impact = group.items.reduce((sum, item) => sum + Math.abs(item.residual), 0);
    const causes = config.causes[direction] || scenarios.custom.causes[direction];
    const cause = causes[(order + group.items.length) % causes.length];
    return {
      id: `INC-${String(order + 1).padStart(3, "0")}`,
      start: group.start,
      end: group.end,
      duration: group.end - group.start + 1,
      peak,
      severity,
      direction,
      impact,
      cause
    };
  }).sort((a, b) => b.peak.score - a.peak.score);
}

function renderAll() {
  syncOutputs();
  renderLabels();
  renderMetrics();
  renderIncidents();
  renderBrief();
  renderChart();
}

function renderLabels() {
  const config = scenarioConfig();
  el.chartTitle.textContent = config.title;
  el.chartSubtitle.textContent = config.subtitle;
  el.pointCount.textContent = `${state.series.length} points`;
}

function renderMetrics() {
  const analysis = state.analysis;
  if (!analysis) return;
  const anomalyRate = analysis.values.length ? (analysis.anomalies.length / analysis.values.length) * 100 : 0;
  const peak = analysis.anomalies.reduce((best, item) => item.score > best.score ? item : best, { score: 0 });
  const peakIncident = analysis.incidents[0];
  const config = scenarioConfig();

  el.heroScore.textContent = formatNumber(analysis.health, 0);
  el.heroSummary.textContent = analysis.health >= 86 ? "Signal is stable with limited abnormal behavior." : analysis.health >= 65 ? "Signal has meaningful deviations worth review." : "Signal shows elevated incident pressure.";
  el.anomalyCount.textContent = analysis.anomalies.length;
  el.anomalyRate.textContent = `${round(anomalyRate, 2)} percent of the signal`;
  el.peakSeverity.textContent = peakIncident ? peakIncident.severity.toUpperCase() : "NONE";
  el.peakLabel.textContent = peakIncident ? `${peakIncident.id} at ${peakIncident.peak.timestamp}` : "No anomalies detected";
  el.forecastDrift.textContent = `${round(analysis.drift, 1)}%`;
  el.forecastLabel.textContent = analysis.drift >= 0 ? "Projected upward pressure" : "Projected downward pressure";
  el.bandWidth.textContent = `${formatNumber(analysis.confidence, config.base > 500 ? 0 : 1)} ${config.unit}`;
  el.bandLabel.textContent = `Threshold ${round(analysis.threshold, 2)} robust sigmas`;
}

function renderIncidents() {
  const incidents = state.analysis?.incidents || [];
  el.incidentCount.textContent = `${incidents.length} incidents`;
  el.incidentList.innerHTML = "";

  if (!incidents.length) {
    const empty = document.createElement("div");
    empty.className = "incident-card";
    empty.innerHTML = "<strong>No active incidents</strong><p>The current signal stays inside the adaptive confidence band.</p>";
    el.incidentList.appendChild(empty);
    return;
  }

  incidents.forEach(incident => {
    const card = document.createElement("article");
    card.className = "incident-card";
    card.innerHTML = `
      <strong>${incident.id} from ${incident.start} to ${incident.end}</strong>
      <span class="severity ${incident.severity}">${incident.severity}</span>
      <span>Peak score ${round(incident.peak.score, 2)} with ${incident.duration} affected points</span>
      <p>${incident.cause}. Estimated impact ${formatNumber(incident.impact, 1)} across the incident window.</p>
    `;
    el.incidentList.appendChild(card);
  });
}

function renderBrief() {
  const analysis = state.analysis;
  if (!analysis) return;
  const config = scenarioConfig();
  const incidents = analysis.incidents;
  const best = incidents[0];
  const topCause = best ? best.cause : "No dominant failure signature detected";
  const recommendation = best ? recommendationFor(best, analysis) : "Keep monitoring the signal and lower sensitivity only if the confidence band is too narrow for operational noise.";
  const currentValue = analysis.values[analysis.values.length - 1];
  const baselineValue = analysis.baseline[analysis.baseline.length - 1];

  el.briefMode.textContent = best ? `${best.id} summary` : "Model summary";
  el.briefBody.innerHTML = `
    <p>${topCause}. The latest value is ${formatNumber(currentValue, 2)} ${config.unit}, compared with an adaptive baseline of ${formatNumber(baselineValue, 2)} ${config.unit}.</p>
    <div class="brief-kpis">
      <div><span>Robust spread</span><strong>${formatNumber(analysis.spread, 2)}</strong></div>
      <div><span>Season length</span><strong>${analysis.period} points</strong></div>
      <div><span>Forecast horizon</span><strong>${analysis.forecast.length} points</strong></div>
      <div><span>Incident pressure</span><strong>${incidents.length ? best.severity : "clear"}</strong></div>
    </div>
    <p>${recommendation}</p>
  `;
}

function recommendationFor(incident, analysis) {
  if (incident.severity === "high" && analysis.drift > 6) return "Prioritize capacity, release, and dependency checks because the forecast keeps moving away from the recent baseline.";
  if (incident.severity === "high") return "Treat this as a live incident and compare the affected window with deploy, traffic, and infrastructure timelines.";
  if (incident.severity === "medium") return "Open a focused investigation and watch the next forecast horizon before changing sensitivity.";
  return "Tag the deviation for review and keep the current threshold unless the same pattern repeats.";
}

function renderChart() {
  const analysis = state.analysis;
  const rect = el.canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  el.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  el.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, rect.width, rect.height);

  if (!analysis || !state.series.length) return;

  const streamLimit = state.streamIndex ?? state.series.length;
  const visibleSeries = state.series.slice(0, streamLimit);
  const visibleValues = visibleSeries.map(point => point.value);
  const visibleBaseline = analysis.baseline.slice(0, streamLimit);
  const forecast = streamLimit >= state.series.length ? analysis.forecast : [];
  const allValues = [...visibleValues, ...visibleBaseline, ...forecast.map(point => point.value)];
  const min = Math.min(...allValues) - analysis.confidence * 1.25;
  const max = Math.max(...allValues) + analysis.confidence * 1.25;
  const pad = { left: 58, right: 26, top: 24, bottom: 42 };
  const width = rect.width - pad.left - pad.right;
  const height = rect.height - pad.top - pad.bottom;
  const totalPoints = visibleSeries.length + forecast.length;
  const x = index => pad.left + (index / Math.max(1, totalPoints - 1)) * width;
  const y = value => pad.top + (1 - (value - min) / Math.max(1, max - min)) * height;

  drawGrid(rect, pad, min, max);
  drawConfidence(visibleBaseline, analysis.confidence, x, y);
  drawLine(visibleBaseline, x, y, "rgba(49, 95, 130, 0.9)", 2);
  drawLine(visibleValues, x, y, "rgba(47, 143, 131, 0.96)", 3);

  if (forecast.length) {
    drawForecast(visibleSeries.length - 1, visibleSeries[visibleSeries.length - 1].value, forecast, x, y);
  }

  analysis.anomalies.filter(item => item.index < streamLimit).forEach(item => {
    ctx.beginPath();
    ctx.fillStyle = item.residual >= 0 ? "#b95a5a" : "#b7832d";
    ctx.strokeStyle = "rgba(255, 254, 250, 0.9)";
    ctx.lineWidth = 2;
    ctx.arc(x(item.index), y(item.value), 5.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  drawLegend(rect);

  state.chartPoints = visibleSeries.map((point, index) => ({
    x: x(index),
    y: y(point.value),
    point,
    baseline: visibleBaseline[index],
    score: analysis.scores[index],
    anomaly: analysis.anomalies.find(item => item.index === index)
  }));
}

function drawGrid(rect, pad, min, max) {
  ctx.save();
  ctx.strokeStyle = "rgba(32, 37, 42, 0.09)";
  ctx.fillStyle = "rgba(104, 112, 111, 0.9)";
  ctx.lineWidth = 1;
  ctx.font = "12px Inter, sans-serif";

  for (let i = 0; i <= 5; i += 1) {
    const ratio = i / 5;
    const y = pad.top + ratio * (rect.height - pad.top - pad.bottom);
    const value = max - ratio * (max - min);
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(rect.width - pad.right, y);
    ctx.stroke();
    ctx.fillText(formatNumber(value, 1), 12, y + 4);
  }

  ctx.restore();
}

function drawConfidence(baseline, confidence, x, y) {
  if (!baseline.length) return;
  ctx.save();
  ctx.beginPath();
  baseline.forEach((value, index) => {
    const px = x(index);
    const py = y(value + confidence);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  [...baseline].reverse().forEach((value, reverseIndex) => {
    const index = baseline.length - 1 - reverseIndex;
    ctx.lineTo(x(index), y(value - confidence));
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(49, 95, 130, 0.11)";
  ctx.fill();
  ctx.restore();
}

function drawLine(values, x, y, color, width) {
  if (!values.length) return;
  ctx.save();
  ctx.beginPath();
  values.forEach((value, index) => {
    const px = x(index);
    const py = y(value);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
  ctx.restore();
}

function drawForecast(startIndex, startValue, forecast, x, y) {
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash([8, 8]);
  ctx.moveTo(x(startIndex), y(startValue));
  forecast.forEach((point, step) => {
    ctx.lineTo(x(startIndex + step + 1), y(point.value));
  });
  ctx.strokeStyle = "rgba(183, 131, 45, 0.94)";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawLegend(rect) {
  const items = [
    ["Signal", "#2f8f83"],
    ["Baseline", "#315f82"],
    ["Forecast", "#b7832d"],
    ["Anomaly", "#b95a5a"]
  ];
  ctx.save();
  ctx.font = "12px Inter, sans-serif";
  items.forEach((item, index) => {
    const x = rect.width - 360 + index * 88;
    const y = 24;
    ctx.fillStyle = item[1];
    ctx.fillRect(x, y - 9, 10, 10);
    ctx.fillStyle = "rgba(32, 37, 42, 0.82)";
    ctx.fillText(item[0], x + 16, y);
  });
  ctx.restore();
}

function nearestPoint(event) {
  if (!state.chartPoints.length) return null;
  const rect = el.canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  return state.chartPoints.reduce((best, point) => {
    const distance = Math.abs(point.x - x);
    return distance < best.distance ? { point, distance } : best;
  }, { point: null, distance: Infinity }).point;
}

function showTooltip(event) {
  const point = nearestPoint(event);
  if (!point) return;
  const config = scenarioConfig();
  const rect = el.canvas.getBoundingClientRect();
  const left = clamp(point.x + 18, 12, rect.width - 220);
  const top = clamp(point.y - 34, 12, rect.height - 112);
  el.tooltip.style.left = `${left}px`;
  el.tooltip.style.top = `${top}px`;
  el.tooltip.innerHTML = `
    <strong>${point.point.timestamp}</strong>
    <span>Value ${formatNumber(point.point.value, 2)} ${config.unit}</span>
    <span>Baseline ${formatNumber(point.baseline, 2)} ${config.unit}</span>
    <span>Score ${formatNumber(point.score, 2)}</span>
  `;
  el.tooltip.hidden = false;
}

function hideTooltip() {
  el.tooltip.hidden = true;
}

function startStream() {
  if (!state.analysis) analyzeSeries();
  state.streamIndex = Math.min(16, state.series.length);
  el.stream.textContent = "Stop Stream";
  renderChart();
  state.streamTimer = window.setInterval(() => {
    state.streamIndex = Math.min(state.series.length, state.streamIndex + 2);
    renderChart();
    if (state.streamIndex >= state.series.length) stopStream(false);
  }, 90);
}

function stopStream(render = true) {
  if (state.streamTimer) {
    window.clearInterval(state.streamTimer);
    state.streamTimer = null;
  }
  state.streamIndex = null;
  el.stream.textContent = "Start Stream";
  if (render && state.analysis) renderChart();
}

function saveWorkspace() {
  const payload = {
    settings: settings(),
    series: state.series,
    savedAt: new Date().toISOString()
  };
  localStorage.setItem("signalforge-workspace", JSON.stringify(payload));
  showToast("Workspace saved locally.");
}

function loadWorkspace() {
  const raw = localStorage.getItem("signalforge-workspace");
  if (!raw) {
    showToast("No saved workspace found.");
    return;
  }
  try {
    const payload = JSON.parse(raw);
    if (payload.settings) {
      el.scenario.value = payload.settings.scenario || "api";
      el.sensitivity.value = payload.settings.sensitivity || 72;
      el.seasonality.value = payload.settings.seasonality || 24;
      el.smooth.value = payload.settings.smooth || 34;
      el.noise.value = payload.settings.noise || 42;
    }
    state.series = Array.isArray(payload.series) ? payload.series : [];
    syncOutputs();
    analyzeSeries();
    showToast("Workspace loaded.");
  } catch {
    showToast("Saved workspace could not be loaded.");
  }
}

function exportJsonReport() {
  if (!state.analysis) analyzeSeries();
  const payload = {
    project: "SignalForge AI",
    generatedAt: new Date().toISOString(),
    settings: settings(),
    health: round(state.analysis.health, 2),
    anomalyCount: state.analysis.anomalies.length,
    incidents: state.analysis.incidents,
    forecast: state.analysis.forecast,
    series: state.series
  };
  downloadFile("signalforge-report.json", JSON.stringify(payload, null, 2), "application/json");
}

function exportCsv() {
  if (!state.analysis) analyzeSeries();
  const rows = ["timestamp,value,baseline,score,is_anomaly"];
  state.series.forEach((point, index) => {
    const anomaly = state.analysis.anomalies.some(item => item.index === index);
    rows.push([point.timestamp, point.value, round(state.analysis.baseline[index], 4), round(state.analysis.scores[index], 4), anomaly].join(","));
  });
  downloadFile("signalforge-analysis.csv", rows.join("\n"), "text/csv");
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast(`${name} exported.`);
}

function showToast(message) {
  el.toast.textContent = message;
  el.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    el.toast.hidden = true;
  }, 2600);
}

function bindEvents() {
  [el.sensitivity, el.seasonality, el.smooth, el.noise].forEach(input => {
    input.addEventListener("input", () => {
      syncOutputs();
      if (state.series.length) analyzeSeries();
    });
  });

  el.scenario.addEventListener("change", () => {
    if (el.scenario.value === "custom" && el.csvInput.value.trim()) importCsv();
    else generateSeries();
  });

  el.generate.addEventListener("click", generateSeries);
  el.analyze.addEventListener("click", analyzeSeries);
  el.import.addEventListener("click", importCsv);
  el.save.addEventListener("click", saveWorkspace);
  el.load.addEventListener("click", loadWorkspace);
  el.exportJson.addEventListener("click", exportJsonReport);
  el.exportCsv.addEventListener("click", exportCsv);
  el.stream.addEventListener("click", () => state.streamTimer ? stopStream() : startStream());
  el.canvas.addEventListener("mousemove", showTooltip);
  el.canvas.addEventListener("mouseleave", hideTooltip);
  window.addEventListener("resize", () => renderChart());

  el.csvFile.addEventListener("change", async () => {
    const file = el.csvFile.files?.[0];
    if (!file) return;
    el.csvInput.value = await file.text();
    importCsv();
    el.csvFile.value = "";
  });
}

bindEvents();
syncOutputs();
generateSeries();
