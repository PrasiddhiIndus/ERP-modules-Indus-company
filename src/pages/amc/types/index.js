/**
 * @typedef {Object} AmcCustomer
 * @property {string} id
 * @property {string} customer_code
 * @property {string} customer_name
 * @property {string} [status]
 */

/**
 * @typedef {Object} AmcContract
 * @property {string} id
 * @property {string} contract_no
 * @property {string} customer_id
 * @property {string} contract_type
 * @property {string} start_date
 * @property {string} end_date
 * @property {string} [status]
 */

/**
 * @typedef {Object} AmcPmSchedule
 * @property {string} id
 * @property {string} pm_no
 * @property {string} due_date
 * @property {string} [status]
 * @property {string} [sla_status]
 */

/**
 * @typedef {Object} AmcComplaint
 * @property {string} id
 * @property {string} complaint_no
 * @property {string} [priority]
 * @property {string} [status]
 * @property {string} [sla_status]
 */

export {};
