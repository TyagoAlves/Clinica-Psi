/**
 * Repositories barrel export
 */

export { BaseRepository, type FindOptions, type PaginatedResult } from './BaseRepository';
export { ProfessionalRepository, professionalRepository } from './ProfessionalRepository';
export { PatientRepository, patientRepository } from './PatientRepository';
export { ServiceRepository, serviceRepository } from './ServiceRepository';
export { AppointmentRepository, appointmentRepository } from './AppointmentRepository';
export { EvolutionRepository, evolutionRepository } from './EvolutionRepository';
export { ConsentRepository, consentRepository } from './ConsentRepository';
export { ConfigRepository, configRepository, DEFAULT_CONSENT_MODELS } from './ConfigRepository';