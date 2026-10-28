import { createRegistry } from '../discovery/registry.js';

const rules = createRegistry('registerRelationship');

export const registerRelationship = rules.register;
export const getRelationshipRules = rules.all;
