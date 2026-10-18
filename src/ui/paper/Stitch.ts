import { ViewStyle } from 'react-native';
import { material } from '../theme';

/** Dashed cream seam border (felt look). Spread into a View style: `[stitch(), { borderRadius: 16 }]`. */
export function stitch(width = 2, color: string = material.yarn): ViewStyle {
  return { borderStyle: 'dashed', borderWidth: width, borderColor: color, borderRadius: 12 };
}
