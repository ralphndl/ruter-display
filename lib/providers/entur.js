const fetch = require('node-fetch');

const QUERY = `
query ($stopId: String!, $modes: [TransportMode]) {
  stopPlace(id: $stopId) {
    name
    estimatedCalls(timeRange: 72000, numberOfDepartures: 20, whiteListedModes: $modes) {
      expectedDepartureTime
      destinationDisplay { frontText }
      serviceJourney { journeyPattern { line { publicCode transportMode } } }
      realtime
      cancellation
    }
  }
}`;

// Oslo is the reference integration. All Entur-specific IDs and fields live here.
module.exports = {
  name: 'Entur',
  requiresEndpoint: true,
  requiredHeaders: ['ET-Client-Name'],
  defaults: {
    timeZone: 'Europe/Oslo',
    locale: 'nb-NO',
    modeColors: {
      tram: '#007fba', metro: '#d76518', bus: '#d51b29',
      rail: '#b84932', water: '#655296', coach: '#28764b',
    },
  },
  attribution: {
    name: 'Entur AS', url: 'https://entur.no/',
    license: 'NLOD (data.norge.no/nlod)', licenseUrl: 'https://data.norge.no/nlod',
  },
  notice: 'Independent project. Not affiliated with or endorsed by Ruter or Entur.',
  async getDepartures({ stopId, modes, source }) {
    const id = stopId.startsWith('NSR:StopPlace:') ? stopId : `NSR:StopPlace:${stopId}`;
    const response = await fetch(source.endpoint, {
      method: 'POST', timeout: source.timeoutMs,
      headers: { 'content-type': 'application/json', ...source.headers },
      body: JSON.stringify({ query: QUERY, variables: { stopId: id, modes: modes.length ? modes : null } }),
    });
    if (!response.ok) throw new Error(`Entur returned HTTP ${response.status}`);
    const data = await response.json();
    if (data.errors) throw new Error('Entur returned a GraphQL error');
    if (!data.data?.stopPlace) throw new Error(`Entur stop not found: ${stopId}`);
    return {
      stopName: data.data.stopPlace.name || stopId,
      departures: (data.data.stopPlace.estimatedCalls || []).map(call => ({
        departureTime: call.expectedDepartureTime,
        destination: call.destinationDisplay?.frontText || '',
        line: call.serviceJourney?.journeyPattern?.line?.publicCode || '?',
        transportMode: call.serviceJourney?.journeyPattern?.line?.transportMode || 'unknown',
        realtime: Boolean(call.realtime), cancelled: Boolean(call.cancellation),
      })),
    };
  },
};
