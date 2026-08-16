import React from 'react';
import { View } from 'react-native';
import Svg, { Polygon as SvgPolygon, Polyline, Circle } from 'react-native-svg';
import { Location, TerritoryPolygon } from '../types';

const SVG_WIDTH = 400;
const SVG_HEIGHT = 600;

interface MapCanvasProps {
  locations: Location[];
  territory?: TerritoryPolygon;
  currentLocation?: Location;
}

export function MapCanvas({ locations, territory, currentLocation }: MapCanvasProps) {
  // Get bounds
  const allPoints = [...locations];
  if (allPoints.length === 0) {
    allPoints.push({ latitude: 52.5, longitude: 13.4, timestamp: 0 });
  }

  const lats = allPoints.map((l) => l.latitude);
  const lons = allPoints.map((l) => l.longitude);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  const padding = 0.002;
  const bounds = {
    minLat: minLat - padding,
    maxLat: maxLat + padding,
    minLon: minLon - padding,
    maxLon: maxLon + padding,
  };

  const latToY = (lat: number) => {
    return SVG_HEIGHT - ((lat - bounds.minLat) / (bounds.maxLat - bounds.minLat)) * SVG_HEIGHT;
  };

  const lonToX = (lon: number) => {
    return ((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * SVG_WIDTH;
  };

  // Trail points
  const trailPoints = locations
    .map((loc) => `${lonToX(loc.longitude)},${latToY(loc.latitude)}`)
    .join(' ');

  // Territory polygon points
  const territoryPoints = territory
    ? territory.coordinates.map((coord) => `${lonToX(coord[1])},${latToY(coord[0])}`).join(' ')
    : '';

  const currentX = currentLocation ? lonToX(currentLocation.longitude) : null;
  const currentY = currentLocation ? latToY(currentLocation.latitude) : null;

  const startX = locations.length > 0 ? lonToX(locations[0].longitude) : null;
  const startY = locations.length > 0 ? latToY(locations[0].latitude) : null;

  return (
    <View style={{ flex: 1, backgroundColor: '#FAFAF8' }}>
      <Svg width={SVG_WIDTH} height={SVG_HEIGHT} viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}>
        {/* Territory polygon (if closed) */}
        {territory && territory.coordinates.length > 2 && (
          <>
            <SvgPolygon
              points={territoryPoints}
              fill="#2ECC7133"
              stroke="#2ECC71"
              strokeWidth="2"
            />
          </>
        )}

        {/* Trail (blue dashed) */}
        {locations.length > 1 && (
          <Polyline
            points={trailPoints}
            stroke="#3498DB"
            strokeWidth="2"
            fill="none"
            strokeDasharray="5,5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Start marker (green dot) */}
        {startX !== null && startY !== null && (
          <Circle cx={startX} cy={startY} r="4" fill="#2ECC71" />
        )}

        {/* Current position (blue dot with glow) */}
        {currentX !== null && currentY !== null && (
          <>
            <Circle cx={currentX} cy={currentY} r="20" fill="#3498DB" opacity="0.15" />
            <Circle cx={currentX} cy={currentY} r="6" fill="#3498DB" />
            <Circle cx={currentX} cy={currentY} r="6" stroke="white" strokeWidth="2" fill="none" />
          </>
        )}
      </Svg>
    </View>
  );
}
