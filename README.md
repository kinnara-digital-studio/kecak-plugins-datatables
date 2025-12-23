# DataTables Menu

## Plugin Type
Userview Menu

---

## Overview
**DataTables Menu** is a **Kecak Userview Menu plugin** that integrates **DataTables** with **Datalist** and **Form** to provide a rich, interactive CRUD experience inside a Userview.

This plugin supports:
- Inline editing
- Row deletion
- Adding new records via popup form
- Field metadata binding from Joget Forms
- Live calculation fields
- Permission-based edit control
- CSP-safe rendering using nonce

---

## Plugin Properties

The following properties are available for configuration:

- *dataListId*  
  The ID of the Joget **Datalist** used as the data source for the DataTable.

- *formDefIdCreate*  
  The **Form Definition ID** used to add new records via popup form.

- *formDefId*  
  The **Form Definition ID** used for editing records and extracting field metadata.

- *permission*  
  A **Userview Permission** configuration that controls whether the current user can add, edit, or delete records.

---

## Request

### Url
Not available

This plugin does **not expose a REST API endpoint** by default.  
The `webService()` method exists but is currently **not implemented**.

All edit, delete, and add operations are handled via internal AJAX calls configured in the frontend.

---

## Frontend Behavior (DataTables Editor)

Frontend functionality is implemented in `datatables-editor.js`.

### Inline Editing
- Click on a table cell to edit inline
- Supported editor types:
  - Text
  - Number
  - Date
  - Textarea
  - Select (dropdown)
- Editing behavior is driven by field metadata
- Read-only, hidden, and calculated fields are excluded automatically

### Save & Cancel
- **Enter**: Save changes
- **Tab**: Save and move to the next editable cell
- **Esc** or click outside: Cancel editing
- Changes are submitted via AJAX in JSON format

---

## Delete Row
- Each row provides a delete action
- Delete requires confirmation dialog
- Uses HTTP `DELETE` request
- Controlled by Userview permission

---

## Add New Record (Popup Form)
- Add button opens a Joget Form in a popup (JPopup)
- Uses:
  - `formDefIdCreate`
  - JSON form definition
  - CSP nonce
- After successful submit, DataTable reloads automatically

---

## Field Metadata Support
The plugin uses metadata extracted from Joget Form JSON, including:
- Field type
- Read-only flag
- Hidden flag
- Select options
- Calculation definitions

Metadata is used to:
- Build inline editors dynamically
- Control edit permissions
- Execute live calculations

---

## Live Calculation Fields
- Calculation equations are defined in field metadata
- Calculations are evaluated in real-time during editing
- Supports multi-pass calculation to resolve field dependencies
- Calculated fields update automatically in the UI
- Hidden calculated fields are supported

---

## Security
- Uses nonce generated via `SecurityUtil.generateNonce`
- CSP-safe for inline scripts and popup forms
- Prevents XSS when rendering dynamic content

---

## Permission Handling
- Add, edit, and delete actions are permission-controlled
- Permission evaluation uses Userview Permission
- The current logged-in user is resolved at runtime
- Frontend editing is disabled automatically if permission is denied

---

## Rendering
The plugin renders the UI using a Freemarker template:
`/templates/DataTablesMenu.ftl`

