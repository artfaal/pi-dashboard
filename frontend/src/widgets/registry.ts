/**
 * Widget registry — maps module_id → React component.
 *
 * To add a new widget:
 *   1. Create MyWidget.tsx in this folder.
 *   2. Import and register it below.
 *   3. Add the matching backend module (modules/my_module.py).
 *   4. Enable it in backend/config.yaml.
 */

import type { ComponentType } from 'react'
import { CO2Widget } from './CO2Widget'
import { InternetWidget } from './InternetWidget'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const WIDGET_REGISTRY: Record<string, ComponentType<any>> = {
  co2: CO2Widget,
  internet: InternetWidget,
}
