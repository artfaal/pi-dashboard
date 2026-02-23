export interface WidgetSlotConfig {
  widgetId: string
  moduleId: string
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
        { widgetId: 'weather',  moduleId: 'weather'  },
        { widgetId: 'internet', moduleId: 'internet' },
      ],
    },
    {
      id: 'sensors',
      label: 'Датчики',
      slots: [
        { widgetId: 'temp_room', moduleId: 'co2' },
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
  rotate: { enabled: false, intervalSeconds: 20 },
}
