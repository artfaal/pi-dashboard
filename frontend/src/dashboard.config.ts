export interface WidgetSlotConfig {
  widgetId: string
  moduleId: string
  detailWidgetId?: string
}

export interface PageConfig {
  id: string
  label: string
  slots: WidgetSlotConfig[]
}

export const DASHBOARD_CONFIG = {
  pages: [
    {
      id: 'home',
      label: 'Главная',
      slots: [
        { widgetId: 'co2',      moduleId: 'co2'      },
        { widgetId: 'weather',  moduleId: 'weather',  detailWidgetId: 'weather_detail' },
        { widgetId: 'internet', moduleId: 'internet' },
      ],
    },
    {
      id: 'plants',
      label: 'Растения',
      slots: [
        { widgetId: 'plants', moduleId: 'plants' },
      ],
    },
  ] as PageConfig[],
  rotate: {
    enabled: import.meta.env.VITE_ROTATE_ENABLED === 'true',
    intervalSeconds: Number(import.meta.env.VITE_ROTATE_INTERVAL ?? 20),
  },
}
