import { LitElement, html } from 'da-lit';
import DA_SDK from 'https://da.live/nx/utils/sdk.js';

const FIELD_TYPES = [
  { id: 'text-input', label: 'Text Input' },
  { id: 'email', label: 'Email' },
  { id: 'telephone-input', label: 'Telephone' },
  { id: 'number-input', label: 'Number' },
  { id: 'date-input', label: 'Date' },
  { id: 'multiline-input', label: 'Multiline Text' },
  { id: 'drop-down', label: 'Drop Down' },
  { id: 'radio-group', label: 'Radio Group' },
  { id: 'checkbox', label: 'Checkbox' },
  { id: 'checkbox-group', label: 'Checkbox Group' },
  { id: 'file-input', label: 'File Upload' },
  { id: 'button', label: 'Button' },
  { id: 'submit-button', label: 'Submit Button' },
  { id: 'reset-button', label: 'Reset Button' },
  { id: 'plain-text', label: 'Plain Text' },
  { id: 'form-image', label: 'Image' },
  { id: 'panel', label: 'Panel' },
  { id: 'form-fragment', label: 'Fragment' },
  { id: 'recaptcha', label: 'reCAPTCHA' },
];

async function loadStyles() {
  const cssUrl = new URL('./form-field-properties.css', import.meta.url);
  const cssText = await fetch(cssUrl).then((r) => r.text());
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(cssText);
  return sheet;
}

const styles = await loadStyles();

async function resolveFields(rawFields) {
  const result = [];
  for (const field of rawFields) {
    if (field['...']) {
      const [filePath] = field['...'].split('#');
      const cleanPath = filePath.replace('../', '');
      const url = `/blocks/form/models/${cleanPath}`;
      const data = await fetch(url).then((r) => r.json());
      result.push(...(data.fields || []));
    } else {
      result.push(field);
    }
  }
  return result;
}

function groupByTab(fields) {
  const sections = [];
  let current = null;
  for (const f of fields) {
    if (f.component === 'tab') {
      current = { label: f.label, name: f.name, fields: [] };
      sections.push(current);
    } else if (current) {
      current.fields.push(f);
    } else {
      // Fields before the first tab go into an implicit Basic section
      if (!sections.length) {
        current = { label: 'Basic', name: 'basic', fields: [] };
        sections.push(current);
      }
      current.fields.push(f);
    }
  }
  return sections;
}

class AemFormFieldProperties extends LitElement {
  static properties = {
    _selectedType: { state: true },
    _sections: { state: true },
    _values: { state: true },
    _activeTab: { state: true },
    _loading: { state: true },
  };

  constructor() {
    super();
    this._selectedType = null;
    this._sections = [];
    this._values = {};
    this._activeTab = null;
    this._loading = false;
    this._actions = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    DA_SDK.then(({ actions }) => {
      this._actions = actions;
    });
  }

  async _selectType(fieldType) {
    this._selectedType = fieldType;
    this._values = {};
    this._loading = true;
    this.requestUpdate();
    try {
      const url = `/blocks/form/models/form-components/_${fieldType}.json`;
      const data = await fetch(url).then((r) => r.json());
      const rawFields = data.models?.[0]?.fields || [];
      const resolved = await resolveFields(rawFields);
      this._sections = groupByTab(resolved);
      this._activeTab = this._sections[0]?.name || null;
    } finally {
      this._loading = false;
    }
  }

  _setValue(name, value) {
    this._values = { ...this._values, [name]: value };
  }

  _insertBlock() {
    const allFields = this._sections.flatMap((s) => s.fields);
    let rows = `<tr><td>${this._selectedType}</td><td></td></tr>`;

    for (const field of allFields) {
      const val = this._values[field.name];
      if (val === undefined || val === null || val === '') continue;
      const defaultVal = field.value ?? '';
      if (String(val) === String(defaultVal)) continue;
      rows += `<tr><td>${field.name}</td><td>${val}</td></tr>`;
    }

    if (this._actions) {
      this._actions.sendHTML(`<table><tbody>${rows}</tbody></table>`);
    }
  }

  _renderInput(field) {
    const val = this._values[field.name] ?? (field.value ?? '');

    if (field.component === 'boolean') {
      return html`
        <label class="prop-row checkbox-row">
          <span class="prop-label">${field.label}</span>
          <input
            type="checkbox"
            .checked=${!!val}
            @change=${(e) => this._setValue(field.name, e.target.checked)}
          />
        </label>
      `;
    }

    if (field.component === 'select') {
      return html`
        <label class="prop-row">
          <span class="prop-label">${field.label}</span>
          <select @change=${(e) => this._setValue(field.name, e.target.value)}>
            ${(field.options || []).map(
              (opt) => html`
                <option value=${opt.value} ?selected=${String(val) === String(opt.value)}>
                  ${opt.name}
                </option>
              `,
            )}
          </select>
        </label>
      `;
    }

    return html`
      <label class="prop-row">
        <span class="prop-label">
          ${field.label}${field.required ? html`<span class="required">*</span>` : ''}
        </span>
        <input
          type="text"
          .value=${String(val)}
          @input=${(e) => this._setValue(field.name, e.target.value)}
        />
      </label>
    `;
  }

  _renderTypeGrid() {
    return html`
      <div class="type-grid">
        ${FIELD_TYPES.map(
          (t) => html`
            <button class="type-card" @click=${() => this._selectType(t.id)}>
              ${t.label}
            </button>
          `,
        )}
      </div>
    `;
  }

  _renderPropertyForm() {
    const activeSection = this._sections.find((s) => s.name === this._activeTab);
    return html`
      <div class="prop-header">
        <button class="back-btn" @click=${() => { this._selectedType = null; }}>← Back</button>
        <span class="prop-type">${this._selectedType}</span>
      </div>
      <div class="tabs">
        ${this._sections.map(
          (s) => html`
            <button
              class="tab ${this._activeTab === s.name ? 'active' : ''}"
              @click=${() => { this._activeTab = s.name; }}
            >
              ${s.label}
            </button>
          `,
        )}
      </div>
      <div class="prop-fields">
        ${(activeSection?.fields || []).map((f) => this._renderInput(f))}
      </div>
      <div class="actions">
        <button class="insert-btn" @click=${() => this._insertBlock()}>Insert Field</button>
      </div>
    `;
  }

  render() {
    if (this._loading) {
      return html`<p class="loading">Loading properties…</p>`;
    }
    return html`
      <h2 class="panel-title">Form Field Properties</h2>
      ${this._selectedType ? this._renderPropertyForm() : this._renderTypeGrid()}
    `;
  }
}

customElements.define('aem-form-field-properties', AemFormFieldProperties);

(async function init() {
  const el = document.createElement('aem-form-field-properties');
  document.body.append(el);
}());
