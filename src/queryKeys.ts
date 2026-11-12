export const queryKeys = {
  vehicles: {
    all: () => ["vehicles"] as const,
    one: (id: string | number) => ["vehicles", String(id)] as const,
  },
  serviceTypes: {
    all: () => ["service_types"] as const,
    one: (id: string | number) => ["service_types", String(id)] as const,
    customFields: (id: string | number) => ["custom_fields", String(id)] as const,
  },
  logs: {
    all: () => ["maintenance_logs"] as const, // Used for invalidating ALL logs across app
    one: (id: string | number) => ["maintenance_logs", String(id)] as const,
    forVehicle: (vehicleId: string | number) => ["maintenance_logs", { vehicleId: String(vehicleId) }] as const,
    forServiceType: (vehicleId: string | number, serviceTypeId: string | number) =>
      ["maintenance_logs", { vehicleId: String(vehicleId), serviceTypeId: String(serviceTypeId) }] as const,
  },
  summaries: {
    forVehicle: (vehicleId: string | number) => ["summaries", String(vehicleId)] as const,
  }
};
