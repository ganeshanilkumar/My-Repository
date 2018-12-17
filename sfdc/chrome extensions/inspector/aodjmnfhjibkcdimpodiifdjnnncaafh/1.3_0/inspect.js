/* eslint-disable no-unused-vars */
/* global React ReactDOM */
/* global sfConn apiVersion */
/* global initButton */
/* eslint-enable no-unused-vars */
"use strict";

class Model {
  constructor(sfHost) {
    this.reactCallback = null;

    // Raw fetched data
    this.globalDescribe = null;
    this.sobjectDescribePromise = null;
    this.objectData = null;
    this.recordData = null;
    this.layoutInfo = null;

    // URL parameters
    this.sobjectName = null;
    this.useToolingApi = null;
    this.recordId = null;

    // Processed data and UI state
    this.sfHost = sfHost;
    this.sfLink = "https://" + this.sfHost;
    this.spinnerCount = 0;
    this.errorMessages = [];
    this.rowsFilter = "";
    this.useTab = "all";
    this.fieldRows = new FieldRowList(this);
    this.childRows = new ChildRowList(this);
    this.detailsFilter = "";
    this.detailsBox = null;
    this.isEditing = false;
    this.hasEntityParticles = false;
  }
  /**
   * Notify React that we changed something, so it will rerender the view.
   * Should only be called once at the end of an event or asynchronous operation, since each call can take some time.
   * All event listeners (functions starting with "on") should call this function if they update the model.
   * Asynchronous operations should use the spinFor function, which will call this function after the asynchronous operation completes.
   * Other functions should not call this function, since they are called by a function that does.
   * @param cb A function to be called once React has processed the update.
   */
  didUpdate(cb) {
    if (this.reactCallback) {
      this.reactCallback(cb);
    }
  }
  /**
   * Show the spinner while waiting for a promise, and show an error if it fails.
   * didUpdate() must be called after calling spinFor.
   * didUpdate() is called when the promise is resolved or rejected, so the caller doesn't have to call it, when it updates the model just before resolving the promise, for better performance.
   * @param actionName Name to show in the errors list if the operation fails.
   * @param promise The promise to wait for.
   */
  spinFor(actionName, promise) {
    this.spinnerCount++;
    promise
      .catch(err => {
        console.error(err);
        this.errorMessages.push("Error " + actionName + ": " + err.message);
      })
      .then(() => {
        this.spinnerCount--;
        this.didUpdate();
      })
      .catch(err => console.log("error handling failed", err));
  }
  recordHeading() {
    let parts;
    if (this.recordData) {
      parts = [this.recordData.Name, this.recordData.Id];
    } else if (this.objectData) {
      parts = [this.objectData.label, this.objectData.keyPrefix];
    } else {
      parts = [];
    }
    if (this.useToolingApi) {
      parts.push("Tooling API");
    }
    return "(" + parts.join(" / ") + ")";
  }
  objectName() {
    // Get with correct case if available, otherwise just return the input.
    return this.objectData ? this.objectData.name : this.sobjectName;
  }
  title() {
    return "ALL DATA: " + this.objectName() + " " + this.recordHeading();
  }
  showDetailsBox(name, allFieldMetadata, detailsFilterList) {
    let self = this;
    let fieldDetails = [];
    for (let key in allFieldMetadata) {
      let value = allFieldMetadata[key];
      let row = key + "," + value;
      fieldDetails.push({
        key,
        value,
        visible() {
          let value = self.detailsFilter.trim().toLowerCase();
          return !value || row.toLowerCase().includes(value);
        }
      });
    }
    this.detailsBox = {rows: fieldDetails, name, detailsFilterList};
  }
  showObjectMetadata() {
    let objectDescribe = this.objectData;
    let props = {};
    addProperties(props, objectDescribe, "desc.", {fields: true, childRelationships: true});
    addProperties(props, this.layoutInfo, "layout.", {detailLayoutSections: true, editLayoutSections: true, relatedLists: true});
    this.showDetailsBox(objectDescribe.name, props, null);
  }
  canEdit() {
    return this.objectData && this.objectData.updateable && this.recordData && this.recordData.Id;
  }
  doEdit() {
    for (let fieldRow of this.fieldRows.rows) {
      if (fieldRow.canEdit()) {
        fieldRow.dataEditValue = fieldRow.dataStringValue();
      }
    }
    this.isEditing = true;
  }
  doSave() {
    let i = this.errorMessages.findIndex(e => e.startsWith("Error saving record:"));
    this.errorMessages.splice(i, 1);
    let record = {};
    this.fieldRows.rows.forEach(fieldRow => fieldRow.saveDataValue(record));
    let recordUrl = this.objectData.urls.rowTemplate.replace("{ID}", this.recordData.Id);
    this.spinFor(
      "saving record",
      sfConn.rest(recordUrl, {method: "PATCH", body: record}).then(() => {
        this.clearRecordData();
        this.setRecordData(sfConn.rest(recordUrl));
      })
    );
  }
  cancelEdit() {
    let i = this.errorMessages.findIndex(e => e.startsWith("Error saving record:"));
    this.errorMessages.splice(i, 1);
    for (let fieldRow of this.fieldRows.rows) {
      fieldRow.dataEditValue = null;
    }
    this.isEditing = false;
  }
  canView() {
    return this.recordData && this.recordData.Id;
  }
  viewLink() {
    if (this.recordData && this.recordData.Id) {
      return "https://" + this.sfHost + "/" + this.recordData.Id;
    }
    if (this.objectData && this.objectData.keyPrefix) {
      return "https://" + this.sfHost + "/" + this.objectData.keyPrefix + "/o";
    }
    return undefined;
  }
  editLayoutLink() {
    if (this.layoutInfo && this.layoutInfo.id) {
      return "https://" + this.sfHost + "//layouteditor/layoutEditor.apexp?type=" + this.sobjectName + "&lid=" + this.layoutInfo.id;
    }
    return undefined;
  }
  exportLink() {
    let objectName = this.sobjectName;
    if (this.objectData && this.objectData.name) {
      objectName = this.objectData.name;
    }
    if (!objectName) {
      return undefined;
    }
    let query = "select Id from " + objectName;
    if (this.recordData && this.recordData.Id) {
      query += " where Id = '" + this.recordData.Id + "'";
    }
    return this.dataExportUrl(query);
  }
  dataExportUrl(query) {
    let args = new URLSearchParams();
    args.set("host", this.sfHost);
    args.set("query", query);
    if (this.useToolingApi) {
      args.set("useToolingApi", "1");
    }
    return "data-export.html?" + args;
  }
  openSetup() {
    let args = new URLSearchParams();
    args.set("host", this.sfHost);
    args.set("object", this.objectName());
    return "open-object-setup.html?" + args;
  }
  setRecordData(recordDataPromise) {
    this.spinFor("retrieving record", recordDataPromise.then(res => {
      for (let name in res) {
        if (name != "attributes") {
          this.fieldRows.getRow(name).dataTypedValue = res[name];
        }
      }
      this.fieldRows.resortRows();
      this.recordData = res;
      this.fieldRows.showHideColumn(true, "value");
      this.spinFor(
        "describing layout",
        this.sobjectDescribePromise.then(sobjectDescribe => {
          if (sobjectDescribe.urls.layouts) {
            return sfConn.rest(sobjectDescribe.urls.layouts + "/" + (res.RecordTypeId || "012000000000000AAA"));
          }
          return undefined;
        }).then(layoutDescribe => {
          if (layoutDescribe) {
            for (let layoutType of [{sections: "detailLayoutSections", property: "detailLayoutInfo"}, {sections: "editLayoutSections", property: "editLayoutInfo"}]) {
              layoutDescribe[layoutType.sections].forEach((section, sectionIndex) => {
                section.layoutRows.forEach((row, rowIndex) => {
                  row.layoutItems.forEach((item, itemIndex) => {
                    item.layoutComponents.forEach((component, componentIndex) => {
                      if (component.type == "Field") {
                        this.fieldRows.getRow(component.value)[layoutType.property] = {
                          indexes: {
                            shownOnLayout: true,
                            sectionIndex,
                            rowIndex,
                            itemIndex,
                            componentIndex
                          },
                          section,
                          row,
                          item,
                          component
                        };
                      }
                    });
                  });
                });
              });
            }
            this.fieldRows.resortRows();
            layoutDescribe.relatedLists.forEach((child, childIndex) => {
              this.childRows.getRow(child.name).relatedListInfo = {
                shownOnLayout: true,
                relatedListIndex: childIndex,
                relatedList: child
              };
            });
            this.childRows.resortRows();
            this.layoutInfo = layoutDescribe;
          }
        })
      );
    }));
  }
  clearRecordData() {
    for (let fieldRow of this.fieldRows.rows) {
      fieldRow.dataTypedValue = undefined;
      fieldRow.dataEditValue = null;
      fieldRow.detailLayoutInfo = undefined;
      fieldRow.editLayoutInfo = undefined;
    }
    for (let childRow of this.childRows.rows) {
      childRow.relatedListInfo = undefined;
    }
    this.isEditing = false;
    this.recordData = null;
    this.layoutInfo = null;
  }
  startLoading() {

    // Fetch id prefix to object name mapping
    this.spinFor("describing global", sfConn.rest("/services/data/v" + apiVersion + "/" + (this.useToolingApi ? "tooling/" : "") + "sobjects/").then(globalDescribe => {
      this.globalDescribe = globalDescribe;
    }));

    // Fetch object data using object describe call
    this.sobjectDescribePromise = sfConn.rest("/services/data/v" + apiVersion + "/" + (this.useToolingApi ? "tooling/" : "") + "sobjects/" + this.sobjectName + "/describe/");
    this.spinFor("describing object", this.sobjectDescribePromise.then(sobjectDescribe => {
      // Display the retrieved object data
      this.objectData = sobjectDescribe;
      for (let fieldDescribe of sobjectDescribe.fields) {
        this.fieldRows.getRow(fieldDescribe.name).fieldDescribe = fieldDescribe;
      }
      this.fieldRows.resortRows();
      for (let childDescribe of sobjectDescribe.childRelationships) {
        this.childRows.getRow(childDescribe.relationshipName).childDescribe = childDescribe;
      }
      this.childRows.resortRows();
    }));

    // Fetch record data using record retrieve call
    if (this.recordId) {
      this.setRecordData(sfConn.rest("/services/data/v" + apiVersion + "/" + (this.useToolingApi ? "tooling/" : "") + "sobjects/" + this.sobjectName + "/" + this.recordId));
    }

    // Fetch fields using a Tooling API call, which returns fields not readable by the current user, but fails if the user does not have access to the Tooling API.
    // The Tooling API is not very stable. It often gives "An unexpected error occurred. Please include this ErrorId if you contact support".
    // We would like to query all meta-fields, to show them when the user clicks a field for more details.
    // But, the more meta-fields we query, the more likely the query is to fail, and the meta-fields that cause failure vary depending on the entity we query, the org we are in, and the current Salesforce release.
    // Therefore qe query the minimum set of meta-fields needed by our main UI.
    this.spinFor(
      "querying tooling particles",
      sfConn.rest("/services/data/v" + apiVersion + "/tooling/query/?q=" + encodeURIComponent("select QualifiedApiName, Label, DataType, FieldDefinition.ReferenceTo, Length, Precision, Scale, IsAutonumber, IsCaseSensitive, IsDependentPicklist, IsEncrypted, IsIdLookup, IsHtmlFormatted, IsNillable, IsUnique, IsCalculated, InlineHelpText, FieldDefinition.DurableId from EntityParticle where EntityDefinition.QualifiedApiName = '" + this.sobjectName + "'")).then(res => {
        for (let entityParticle of res.records) {
          this.fieldRows.getRow(entityParticle.QualifiedApiName).entityParticle = entityParticle;
        }
        this.hasEntityParticles = true;
        this.fieldRows.resortRows();
      })
    );

  }
}

class RowList {
  constructor(rowConstructor, model) {
    this._rowConstructor = rowConstructor;
    this.model = model;
    this._map = new Map();
    this._sortCol = "name";
    this._sortDir = 1;
    this._nextReactKey = 0;
    this.rows = [];
    this.availableColumns = null;
    this.selectedColumnMap = null;
  }
  getRow(name) {
    if (!name) { // related lists may not have a name
      let row = new this._rowConstructor(name, this._nextReactKey++, this);
      this.rows.push(row);
      return row;
    }
    let row = this._map.get(name);
    if (!row) {
      row = new this._rowConstructor(name, this._nextReactKey++, this);
      this.rows.push(row);
      this._map.set(name, row);
    }
    return row;
  }
  sortRowsBy(col) {
    this._sortDir = col == this._sortCol ? -this._sortDir : 1;
    this._sortCol = col;
    this.resortRows();
  }
  resortRows() {
    let s = v =>
      v === undefined ? "\uFFFD"
      : v == null ? ""
      : String(v).trim();
    this.rows.sort((a, b) => this._sortDir * s(a.sortKey(this._sortCol)).localeCompare(s(b.sortKey(this._sortCol))));
  }
  initColumns(cols) {
    this.selectedColumnMap = new Map();
    for (let col of cols) {
      this.selectedColumnMap.set(col, this.createColumn(col));
    }
  }
  showHideColumn(show, col) {
    if (show == this.selectedColumnMap.has(col)) {
      return;
    }
    if (show) {
      this.selectedColumnMap.set(col, this.createColumn(col));
    } else {
      this.selectedColumnMap.delete(col);
    }
  }
  toggleAvailableColumns() {
    if (this.availableColumns) {
      this.availableColumns = null;
      return;
    }
    let cols = new Set();
    for (let row of this.rows) {
      for (let prop in row.rowProperties()) {
        cols.add(prop);
      }
    }
    this.availableColumns = Array.from(cols);
  }
  showColumn(col, filterValue) {
    let value = filterValue == null ? "" : "" + filterValue;
    this.showHideColumn(true, col);
    if (value) {
      this.model.useTab = this.listName;
      this.selectedColumnMap.get(col).columnFilter = value;
    }
  }
}

class FieldRowList extends RowList {
  constructor(model) {
    super(FieldRow, model);
    this.listName = "fields";
    this.initColumns(["name", "label", "type"]);
    this.fetchFieldDescriptions = true;
  }
  createColumn(col) {
    return {
      name: col,
      label: col == "name" ? "Field API Name"
        : col == "label" ? "Label"
        : col == "type" ? "Type"
        : col == "value" ? "Value"
        : col == "helptext" ? "Help text"
        : col == "desc" ? "Description"
        : col,
      className: col == "name" ? "field-name"
        : col == "label" ? "field-label"
        : "field-column",
      reactElement: col == "value" ? FieldValueCell
        : col == "type" ? FieldTypeCell
        : DefaultCell,
      columnFilter: ""
    };
  }
  showHideColumn(show, col) {
    if (col == "desc" && this.fetchFieldDescriptions) {
      this.fetchFieldDescriptions = false;
      this.rows.forEach(fieldRow => fieldRow.showFieldDescription());
    }
    super.showHideColumn(show, col);
  }
}

class ChildRowList extends RowList {
  constructor(model) {
    super(ChildRow, model);
    this.listName = "childs";
    this.initColumns(["name", "object", "field", "label"]);
  }
  createColumn(col) {
    return {
      name: col,
      label: col == "name" ? "Relationship Name"
        : col == "object" ? "Child Object"
        : col == "field" ? "Field"
        : col == "label" ? "Label"
        : col,
      className: "child-column",
      reactElement: col == "object" ? ChildObjectCell : DefaultCell,
      columnFilter: ""
    };
  }
}

class TableRow {
  visible() {
    let selectedColumns = Array.from(this.rowList.selectedColumnMap.values());
    let split = terms => terms.trim().toLowerCase().split(/[ \t]+/);
    let search = (term, col) => {
      let s = this.sortKey(col.name);
      return s != null && ("" + s).toLowerCase().includes(term);
    };
    if (this.rowList.model.useTab != "all") {
      return selectedColumns.every(col =>
        !col.columnFilter || split(col.columnFilter).every(term => search(term, col))
      );
    } else {
      return split(this.rowList.model.rowsFilter).every(term =>
        !term || selectedColumns.some(col => search(term, col))
      );
    }
  }
}

class FieldRow extends TableRow {
  constructor(fieldName, reactKey, rowList) {
    super();
    this.rowList = rowList;
    this.fieldName = fieldName;
    this.reactKey = reactKey;
    this.fieldDescribe = undefined;
    this.dataTypedValue = undefined;
    this.dataEditValue = null;
    this.detailLayoutInfo = undefined;
    this.editLayoutInfo = undefined;
    this.entityParticle = undefined;
    this.fieldParticleMetadata = undefined;
    this.recordIdPop = null;
  }
  rowProperties() {
    let props = {};
    if (typeof this.dataTypedValue != "undefined") {
      addProperties(props, {dataValue: this.dataTypedValue}, "", {});
    }
    if (this.fieldDescribe) {
      addProperties(props, this.fieldDescribe, "desc.", {});
    }
    if (this.entityParticle) {
      addProperties(props, this.entityParticle, "part.", {});
    }
    if (this.fieldParticleMetadata) {
      addProperties(props, this.fieldParticleMetadata, "meta.", {});
    }
    if (this.detailLayoutInfo) {
      addProperties(props, this.detailLayoutInfo.indexes, "layout.", {});
      addProperties(props, this.detailLayoutInfo.section, "layoutSection.", {layoutRows: true});
      addProperties(props, this.detailLayoutInfo.row, "layoutRow.", {layoutItems: true});
      addProperties(props, this.detailLayoutInfo.item, "layoutItem.", {layoutComponents: true});
      addProperties(props, this.detailLayoutInfo.component, "layoutComponent.", {details: true, components: true});
    } else if (this.rowList.model.layoutInfo) {
      addProperties(props, {shownOnLayout: false}, "layout.", {});
    }
    if (this.editLayoutInfo) {
      addProperties(props, this.editLayoutInfo.indexes, "editLayout.", {});
      addProperties(props, this.editLayoutInfo.section, "editLayoutSection.", {layoutRows: true});
      addProperties(props, this.editLayoutInfo.row, "editLayoutRow.", {layoutItems: true});
      addProperties(props, this.editLayoutInfo.item, "editLayoutItem.", {layoutComponents: true});
      addProperties(props, this.editLayoutInfo.component, "editLayoutComponent.", {details: true, components: true});
    } else if (this.rowList.model.layoutInfo) {
      addProperties(props, {shownOnLayout: false}, "editLayout.", {});
    }
    return props;
  }
  dataStringValue() {
    return this.dataTypedValue == null ? "" : "" + this.dataTypedValue;
  }
  fieldLabel() {
    if (this.fieldDescribe) {
      return this.fieldDescribe.label;
    }
    if (this.entityParticle) {
      return this.entityParticle.Label;
    }
    return undefined;
  }
  fieldHelptext() {
    if (this.fieldDescribe) {
      return this.fieldDescribe.inlineHelpText;
    }
    if (this.entityParticle) {
      return this.entityParticle.InlineHelpText;
    }
    return undefined;
  }
  fieldDesc() {
    return this.fieldParticleMetadata && this.fieldParticleMetadata.Metadata.description;
  }
  fieldTypeDesc() {
    let fieldDescribe = this.fieldDescribe;
    if (fieldDescribe) {
      return fieldDescribe.type == "reference"
      ? "[" + fieldDescribe.referenceTo.join(", ") + "]"
      : (fieldDescribe.type || "")
        + (fieldDescribe.length ? " (" + fieldDescribe.length + ")" : "")
        + (fieldDescribe.precision || fieldDescribe.scale ? " (" + fieldDescribe.precision + ", " + fieldDescribe.scale + ")" : "")
        + (fieldDescribe.autoNumber ? ", auto number" : "")
        + (fieldDescribe.caseSensitive ? ", case sensitive" : "")
        + (fieldDescribe.dependentPicklist ? ", dependent" : "")
        + (fieldDescribe.encrypted ? ", encrypted" : "")
        + (fieldDescribe.externalId ? ", external id" : "")
        + (fieldDescribe.htmlFormatted ? ", html" : "")
        + (!fieldDescribe.nillable ? ", required" : "")
        + (fieldDescribe.restrictedPicklist ? ", restricted" : "")
        + (fieldDescribe.unique ? ", unique" : "")
        + (fieldDescribe.calculated ? "*" : "");
    }
    let particle = this.entityParticle;
    if (particle) {
      return particle.DataType == "reference" && particle.FieldDefinition.ReferenceTo.referenceTo
      ? "[" + particle.FieldDefinition.ReferenceTo.referenceTo.join(", ") + "]"
      : (particle.DataType || "")
        + (particle.Length ? " (" + particle.Length + ")" : "")
        + (particle.Precision || particle.Scale ? " (" + particle.Precision + ", " + particle.Scale + ")" : "")
        + (particle.IsAutonumber ? ", auto number" : "")
        + (particle.IsCaseSensitive ? ", case sensitive" : "")
        + (particle.IsDependentPicklist ? ", dependent" : "")
        + (particle.IsEncrypted ? ", encrypted" : "")
        + (particle.IsIdLookup ? ", external id" : "")
        + (particle.IsHtmlFormatted ? ", html" : "")
        + (!particle.IsNillable ? ", required" : "")
        + (particle.IsUnique ? ", unique" : "")
        + (particle.IsCalculated ? "*" : "");
    }
    return undefined;
  }
  referenceTypes() {
    let fieldDescribe = this.fieldDescribe;
    if (fieldDescribe) {
      return fieldDescribe.type == "reference" ? fieldDescribe.referenceTo : null;
    }
    let particle = this.entityParticle;
    if (particle) {
      return particle.DataType == "reference" ? particle.FieldDefinition.ReferenceTo.referenceTo : null;
    }
    return [];
  }
  fieldIsCalculated() {
    if (this.fieldDescribe) {
      return this.fieldDescribe.calculated;
    }
    if (this.entityParticle) {
      return this.entityParticle.IsCalculated;
    }
    return false;
  }
  fieldIsHidden() {
    return !this.fieldDescribe;
  }
  openSetup() {
    let args = new URLSearchParams();
    args.set("host", this.rowList.model.sfHost);
    args.set("object", this.rowList.model.objectName());
    args.set("field", this.fieldName);
    return "open-field-setup.html?" + args;
  }
  summary() {
    let fieldDescribe = this.fieldDescribe;
    if (fieldDescribe) {
      return this.fieldName + "\n"
        + (fieldDescribe.calculatedFormula ? "Formula: " + fieldDescribe.calculatedFormula + "\n" : "")
        + (fieldDescribe.inlineHelpText ? "Help text: " + fieldDescribe.inlineHelpText + "\n" : "")
        + (fieldDescribe.picklistValues && fieldDescribe.picklistValues.length > 0 ? "Picklist values: " + fieldDescribe.picklistValues.map(pickval => pickval.value).join(", ") + "\n" : "")
        ;
    }
    // Entity particle does not contain any of this information
    return this.fieldName + "\n(Details not available)";
  }
  isEditing() {
    return typeof this.dataEditValue == "string";
  }
  canEdit() {
    return this.fieldDescribe && this.fieldDescribe.updateable;
  }
  tryEdit() {
    if (!this.isEditing() && this.rowList.model.canEdit() && this.canEdit()) {
      this.dataEditValue = this.dataStringValue();
      this.rowList.model.isEditing = true;
      return true;
    }
    return false;
  }
  saveDataValue(recordData) {
    if (this.isEditing()) {
      recordData[this.fieldDescribe.name] = this.dataEditValue == "" ? null : this.dataEditValue;
    }
  }
  isId() {
    if (this.fieldDescribe) {
      return this.fieldDescribe.type == "reference" && !!this.dataTypedValue;
    }
    if (this.entityParticle) {
      return this.entityParticle.DataType == "reference" && !!this.dataTypedValue;
    }
    return false;
  }
  idLink() {
    return "https://" + this.rowList.model.sfHost + "/" + this.dataTypedValue;
  }
  toggleRecordIdPop() {
    if (this.recordIdPop) {
      this.recordIdPop = null;
      return;
    }
    let recordId = this.dataTypedValue;
    let keyPrefix = recordId.substring(0, 3);
    let links;
    if (this.rowList.model.globalDescribe) {
      links = this.rowList.model.globalDescribe.sobjects
        .filter(sobject => sobject.keyPrefix == keyPrefix)
        .map(sobject => {
          let args = new URLSearchParams();
          args.set("host", this.rowList.model.sfHost);
          args.set("objectType", sobject.name);
          if (this.rowList.model.useToolingApi) {
            args.set("useToolingApi", "1");
          }
          args.set("recordId", recordId);
          return {href: "inspect.html?" + args, text: "Show all data (" + sobject.name + ")"};
        });
    } else {
      links = [];
    }
    links.push({href: this.idLink(), text: "View in Salesforce"});
    this.recordIdPop = links;
  }
  showReferenceUrl(type) {
    let args = new URLSearchParams();
    args.set("host", this.rowList.model.sfHost);
    args.set("objectType", type);
    if (this.rowList.model.useToolingApi) {
      args.set("useToolingApi", "1");
    }
    return "inspect.html?" + args;
  }
  sortKey(col) {
    switch (col) {
      case "name": return this.fieldName;
      case "label": return this.fieldLabel();
      case "helptext": return this.fieldHelptext();
      case "desc": return this.fieldDesc();
      case "value": return this.dataTypedValue;
      case "type": return this.fieldTypeDesc();
      default: return this.rowProperties()[col];
    }
  }
  showFieldDescription() {
    if (!this.entityParticle) {
      return;
    }
    this.rowList.model.spinFor(
      "getting field definition metadata for " + this.fieldName,
      sfConn.rest("/services/data/v" + apiVersion + "/tooling/query/?q=" + encodeURIComponent("select Metadata from FieldDefinition where DurableId = '" + this.entityParticle.FieldDefinition.DurableId + "'")).then(fieldDefs => {
        this.fieldParticleMetadata = fieldDefs.records[0];
      })
    );
  }
}

class ChildRow extends TableRow {
  constructor(childName, reactKey, rowList) {
    super();
    this.rowList = rowList;
    this.childName = childName;
    this.reactKey = reactKey;
    this.childDescribe = undefined;
    this.relatedListInfo = undefined;
  }
  rowProperties() {
    let props = {};
    if (this.childDescribe) {
      addProperties(props, this.childDescribe, "child.", {});
    }
    if (this.relatedListInfo) {
      addProperties(props, this.relatedListInfo, "layout.", {});
    } else if (this.rowList.model.layoutInfo) {
      addProperties(props, {shownOnLayout: false}, "layout.", {});
    }
    return props;
  }
  childObject() {
    if (this.childDescribe) {
      return this.childDescribe.childSObject;
    }
    if (this.relatedListInfo) {
      return this.relatedListInfo.relatedList.sobject;
    }
    return undefined;
  }
  childField() {
    if (this.childDescribe) {
      return this.childDescribe.field;
    }
    if (this.relatedListInfo) {
      return this.relatedListInfo.relatedList.field;
    }
    return undefined;
  }
  childLabel() {
    if (this.relatedListInfo) {
      return this.relatedListInfo.relatedList.label;
    }
    return undefined;
  }
  sortKey(col) {
    switch (col) {
      case "name": return this.childName;
      case "object": return this.childObject();
      case "field": return this.childField();
      case "label": return this.childLabel();
      default: return this.rowProperties()[col];
    }
  }
  showChildObjectUrl() {
    let childDescribe = this.childDescribe;
    if (childDescribe) {
      let args = new URLSearchParams();
      args.set("host", this.rowList.model.sfHost);
      args.set("objectType", childDescribe.childSObject);
      if (this.rowList.model.useToolingApi) {
        args.set("useToolingApi", "1");
      }
      return "inspect.html?" + args;
    }
    return "";
  }
  openSetup() {
    let childDescribe = this.childDescribe;
    if (childDescribe) {
      let args = new URLSearchParams();
      args.set("host", this.rowList.model.sfHost);
      args.set("object", childDescribe.childSObject);
      args.set("field", childDescribe.field);
      return "open-field-setup.html?" + args;
    }
    let relatedListInfo = this.relatedListInfo;
    if (relatedListInfo) {
      let args = new URLSearchParams();
      args.set("host", this.rowList.model.sfHost);
      args.set("object", relatedListInfo.relatedList.sobject);
      args.set("field", relatedListInfo.relatedList.field);
      return "open-field-setup.html?" + args;
    }
    return "open-field-setup.html";
  }
  summary() {
    return undefined;
  }
  queryListUrl() {
    let record = this.rowList.model.recordData;
    if (!record || !record.Id) {
      return "";
    }
    let relatedListInfo = this.relatedListInfo;
    if (relatedListInfo) {
      return this.rowList.model.dataExportUrl("select Id, " + relatedListInfo.relatedList.columns.map(c => c.name).join(", ") + " from " + relatedListInfo.relatedList.sobject + " where " + relatedListInfo.relatedList.field + " = '" + record.Id + "'");
    }
    let childDescribe = this.childDescribe;
    if (childDescribe) {
      return this.rowList.model.dataExportUrl("select Id from " + childDescribe.childSObject + " where " + childDescribe.field + " = '" + record.Id + "'");
    }
    return "";
  }
}

function addProperties(map, object, prefix, ignore) {
  for (let key in object) {
    let value = object[key];
    if (ignore[key]) {
      // empty
    } else if (value && typeof value == "object") {
      addProperties(map, value, prefix + key + ".", {});
    } else {
      map[prefix + key] = value;
    }
  }
}

let h = React.createElement;

class App extends React.Component {
  constructor(props) {
    super(props);
    this.onUseAllTab = this.onUseAllTab.bind(this);
    this.onUseFieldsTab = this.onUseFieldsTab.bind(this);
    this.onUseChildsTab = this.onUseChildsTab.bind(this);
    this.onRowsFilterInput = this.onRowsFilterInput.bind(this);
    this.onClearAndFocusFilter = this.onClearAndFocusFilter.bind(this);
    this.onShowObjectMetadata = this.onShowObjectMetadata.bind(this);
    this.onDoEdit = this.onDoEdit.bind(this);
    this.onDoSave = this.onDoSave.bind(this);
    this.onCancelEdit = this.onCancelEdit.bind(this);
  }
  componentDidMount() {
    this.refs.rowsFilter.focus();
  }
  onUseAllTab(e) {
    let {model} = this.props;
    e.preventDefault();
    model.useTab = "all";
    model.didUpdate();
  }
  onUseFieldsTab(e) {
    let {model} = this.props;
    e.preventDefault();
    model.useTab = "fields";
    model.didUpdate();
  }
  onUseChildsTab(e) {
    let {model} = this.props;
    e.preventDefault();
    model.useTab = "childs";
    model.didUpdate();
  }
  onRowsFilterInput(e) {
    let {model} = this.props;
    model.rowsFilter = e.target.value;
    model.didUpdate();
  }
  onClearAndFocusFilter(e) {
    e.preventDefault();
    let {model} = this.props;
    model.rowsFilter = "";
    this.refs.rowsFilter.focus();
    model.didUpdate();
  }
  onShowObjectMetadata(e) {
    e.preventDefault();
    let {model} = this.props;
    model.showObjectMetadata();
    model.didUpdate();
  }
  onDoEdit() {
    let {model} = this.props;
    model.doEdit();
    model.didUpdate();
  }
  onDoSave() {
    let {model} = this.props;
    model.doSave();
    model.didUpdate();
  }
  onCancelEdit() {
    let {model} = this.props;
    model.cancelEdit();
    model.didUpdate();
  }
  render() {
    let {model} = this.props;
    document.title = model.title();
    return (
      h("div", {},
        h("div", {className: "object-bar"},
          h("img", {id: "spinner", src: "data:image/gif;base64,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", hidden: model.spinnerCount == 0}),
          h("a", {href: model.sfLink, className: "sf-link"},
            h("svg", {viewBox: "0 0 24 24"},
              h("path", {d: "M18.9 12.3h-1.5v6.6c0 .2-.1.3-.3.3h-3c-.2 0-.3-.1-.3-.3v-5.1h-3.6v5.1c0 .2-.1.3-.3.3h-3c-.2 0-.3-.1-.3-.3v-6.6H5.1c-.1 0-.3-.1-.3-.2s0-.2.1-.3l6.9-7c.1-.1.3-.1.4 0l7 7v.3c0 .1-.2.2-.3.2z"})
            ),
            " Salesforce Home"
          ),
          h("span", {className: "object-tab" + (model.useTab == "all" ? " active-tab" : "")},
            h("a", {href: "about:blank", onClick: this.onUseAllTab}, "All")
          ),
          h("span", {className: "object-tab" + (model.useTab == "fields" ? " active-tab" : "")},
            h("a", {href: "about:blank", className: "tab-with-icon", onClick: this.onUseFieldsTab}, "Fields"),
            h(ColumnsVisibiltyBox, {
              rowList: model.fieldRows,
              label: "Field columns",
              content: () => [
                h(ColumnVisibiltyToggle, {rowList: model.fieldRows, key: "name", name: "name", disabled: true}),
                h(ColumnVisibiltyToggle, {rowList: model.fieldRows, key: "label", name: "label"}),
                h(ColumnVisibiltyToggle, {rowList: model.fieldRows, key: "type", name: "type"}),
                h(ColumnVisibiltyToggle, {rowList: model.fieldRows, key: "value", name: "value", disabled: !model.canView()}),
                h(ColumnVisibiltyToggle, {rowList: model.fieldRows, key: "helptext", name: "helptext"}),
                h(ColumnVisibiltyToggle, {rowList: model.fieldRows, key: "desc", name: "desc", disabled: !model.hasEntityParticles}),
                h("hr", {key: "---"}),
                model.fieldRows.availableColumns.map(col => h(ColumnVisibiltyToggle, {key: col, name: col, label: col, rowList: model.fieldRows}))
              ]
            })
          ),
          h("span", {className: "object-tab" + (model.useTab == "childs" ? " active-tab" : "")},
            h("a", {href: "about:blank", className: "tab-with-icon", onClick: this.onUseChildsTab}, "Relations"),
            h(ColumnsVisibiltyBox, {
              rowList: model.childRows,
              label: "Relationship columns",
              content: () => [
                ["name", "object", "field", "label"].map(col => h(ColumnVisibiltyToggle, {key: col, rowList: model.childRows, name: col})),
                h("hr", {key: "---"}),
                model.childRows.availableColumns.map(col => h(ColumnVisibiltyToggle, {key: col, rowList: model.childRows, name: col}))
              ]
            })
          ),
          model.useTab != "all" ? null : h("div", {className: "filter-box"},
            h("svg", {className: "filter-icon"},
              h("use", {xlinkHref: "symbols.svg#search"})
            ),
            h("input", {className: "filter-input", placeholder: "Filter", value: model.rowsFilter, onChange: this.onRowsFilterInput, ref: "rowsFilter"}),
            h("a", {href: "about:blank", className: "filter-clear", onClick: this.onClearAndFocusFilter},
              h("svg", {className: "filter-clear-icon"},
                h("use", {xlinkHref: "symbols.svg#clear"})
              )
            )
          ),
          h("h1", {className: "object-name"},
            h("span", {className: "quick-select"}, model.objectName()),
            " ",
            model.recordHeading()
          ),
          h("span", {className: "object-actions"},
            !model.isEditing && (model.useTab == "all" || model.useTab == "fields") ? h("button", {title: "Inline edit the values of this record", className: "button", disabled: !model.canEdit() || !model.fieldRows.selectedColumnMap.has("value"), onClick: this.onDoEdit}, "Edit") : null,
            model.isEditing && (model.useTab == "all" || model.useTab == "fields") ? h("button", {title: "Inline edit the values of this record", className: "button", onClick: this.onDoSave}, "Save") : null,
            model.isEditing && (model.useTab == "all" || model.useTab == "fields") ? h("button", {title: "Inline edit the values of this record", className: "button", onClick: this.onCancelEdit}, "Cancel") : null,
            model.exportLink() ? h("a", {href: model.exportLink(), title: "Export data from this object", className: "button"}, "Export") : null,
            model.viewLink() ? h("a", {href: model.viewLink(), title: "View this record in Salesforce", className: "button"}, "View") : null,
            model.editLayoutLink() ? h("a", {href: model.editLayoutLink(), title: "Open the page layout editor", className: "button"}, "Edit layout") : null,
            model.objectName() ? h("a", {href: "about:blank", onClick: this.onShowObjectMetadata, className: "button"}, "More") : null,
            model.objectName() ? h("a", {href: model.openSetup(), className: "button"}, "Setup") : null
          )
        ),
        h("div", {className: "body " + (model.fieldRows.selectedColumnMap.size < 2 && model.childRows.selectedColumnMap.size < 2 ? "empty " : "")},
          h("div", {hidden: model.errorMessages.length == 0, className: "error-message"}, model.errorMessages.map((data, index) => h("div", {key: index}, data))),
          model.useTab == "all" || model.useTab == "fields" ? h(RowTable, {
            rowList: model.fieldRows,
            actionsColumn: {className: "field-actions", reactElement: FieldActionsCell},
            classNameForRow: row => (row.fieldIsCalculated() ? "fieldCalculated " : "") + (row.fieldIsHidden() ? "fieldHidden " : "")
          }) : null,
          model.useTab == "all" ? h("hr", {}) : null,
          model.useTab == "all" || model.useTab == "childs" ? h(RowTable, {
            rowList: model.childRows,
            actionsColumn: {className: "child-actions", reactElement: ChildActionsCell},
            classNameForRow: () => ""
          }) : null
        ),
        model.detailsBox ? h(DetailsBox, {model}) : null
      )
    );
  }
}

class ColumnsVisibiltyBox extends React.Component {
  constructor(props) {
    super(props);
    this.onAvailableColumnsClick = this.onAvailableColumnsClick.bind(this);
  }
  onAvailableColumnsClick(e) {
    e.preventDefault();
    let {rowList} = this.props;
    rowList.toggleAvailableColumns();
    rowList.model.didUpdate();
  }
  render() {
    let {rowList, label, content} = this.props;
    return h("span", {className: "column-button-outer"},
      h("a", {href: "about:blank", onClick: this.onAvailableColumnsClick, className: "button-icon-link"},
        h("svg", {className: "button-icon"},
          h("use", {xlinkHref: "symbols.svg#chevrondown"})
        )
      ),
      rowList.availableColumns ? h("div", {className: "column-popup"},
        h("div", {className: "column-popup-inner"},
          h("span", {className: "menu-item"}, label),
          content()
        )
      ) : null
    );
  }
}

class ColumnVisibiltyToggle extends React.Component {
  constructor(props) {
    super(props);
    this.onShowColumnChange = this.onShowColumnChange.bind(this);
  }
  onShowColumnChange(e) {
    let {rowList, name} = this.props;
    rowList.showHideColumn(e.target.checked, name);
    rowList.model.didUpdate();
  }
  render() {
    let {rowList, name, disabled} = this.props;
    return h("label", {className: "menu-item"},
      h("input", {
        type: "checkbox",
        checked: rowList.selectedColumnMap.has(name),
        onChange: this.onShowColumnChange,
        disabled
      }),
      rowList.createColumn(name).label
    );
  }
}

class RowTable extends React.Component {
  render() {
    let {rowList, actionsColumn, classNameForRow} = this.props;
    let selectedColumns = Array.from(rowList.selectedColumnMap.values());
    return h("table", {},
      h("thead", {},
        h("tr", {},
          selectedColumns.map(col =>
            h(HeaderCell, {key: col.name, col, rowList})
          ),
          h("th", {className: actionsColumn.className}, "Actions")
        ),
        rowList.model.useTab != "all" ? h("tr", {},
          selectedColumns.map(col =>
            h(FilterCell, {key: col.name, col, rowList})
          ),
          h("th", {className: actionsColumn.className})
        ) : null
      ),
      h("tbody", {}, rowList.rows.map(row =>
        h("tr", {className: classNameForRow(row), hidden: !row.visible(), title: row.summary(), key: row.reactKey},
          selectedColumns.map(col =>
            h(col.reactElement, {key: col.name, row, col})
          ),
          h(actionsColumn.reactElement, {row})
        )
      ))
    );
  }
}

class HeaderCell extends React.Component {
  constructor(props) {
    super(props);
    this.onSortRowsBy = this.onSortRowsBy.bind(this);
  }
  onSortRowsBy() {
    let {rowList, col} = this.props;
    rowList.sortRowsBy(col.name);
    rowList.model.didUpdate();
  }
  render() {
    let {col} = this.props;
    return h("th",
      {
        className: col.className,
        tabIndex: 0,
        onClick: this.onSortRowsBy
      },
      col.label
    );
  }
}

class FilterCell extends React.Component {
  constructor(props) {
    super(props);
    this.onColumnFilterInput = this.onColumnFilterInput.bind(this);
  }
  onColumnFilterInput(e) {
    let {rowList, col} = this.props;
    col.columnFilter = e.target.value;
    rowList.model.didUpdate();
  }
  render() {
    let {col} = this.props;
    return h("th", {className: col.className},
      h("input", {
        placeholder: "Filter",
        className: "column-filter-box",
        value: col.columnFilter,
        onChange: this.onColumnFilterInput
      })
    );
  }
}

class DefaultCell extends React.Component {
  render() {
    let {row, col} = this.props;
    return h("td", {className: col.className},
      h(TypedValue, {value: row.sortKey(col.name)})
    );
  }
}

class FieldValueCell extends React.Component {
  constructor(props) {
    super(props);
    this.onTryEdit = this.onTryEdit.bind(this);
    this.onDataEditValueInput = this.onDataEditValueInput.bind(this);
    this.onCancelEdit = this.onCancelEdit.bind(this);
    this.onRecordIdClick = this.onRecordIdClick.bind(this);
  }
  onTryEdit(e) {
    let {row} = this.props;
    if (row.tryEdit()) {
      let td = e.nativeEvent.currentTarget;
      row.rowList.model.didUpdate(() => td.querySelector("textarea").focus());
    }
  }
  onDataEditValueInput(e) {
    let {row} = this.props;
    row.dataEditValue = e.target.value;
    row.rowList.model.didUpdate();
  }
  onCancelEdit(e) {
    e.preventDefault();
    let {row} = this.props;
    row.dataEditValue = null;
    row.rowList.model.didUpdate();
  }
  onRecordIdClick(e) {
    e.preventDefault();
    let {row} = this.props;
    row.toggleRecordIdPop();
    row.rowList.model.didUpdate();
  }
  render() {
    let {row, col} = this.props;
    if (row.isEditing()) {
      return h("td", {className: col.className},
        h("textarea", {value: row.dataEditValue, onChange: this.onDataEditValueInput}),
        h("a", {href: "about:blank", onClick: this.onCancelEdit, className: "undo-button"}, "\u21B6")
      );
    } else if (row.isId()) {
      return h("td", {className: col.className, onDoubleClick: this.onTryEdit},
        h("div", {className: "value-text quick-select"}, h("a", {href: row.idLink() /*used to show visited color*/, onClick: this.onRecordIdClick}, row.dataStringValue())),
        row.recordIdPop == null ? null : h("div", {className: "pop-menu"}, row.recordIdPop.map(link => h("a", {key: link.href, href: link.href}, link.text)))
      );
    } else {
      return h("td", {className: col.className, onDoubleClick: this.onTryEdit},
        h(TypedValue, {value: row.sortKey(col.name)})
      );
    }
  }
}

class FieldTypeCell extends React.Component {
  render() {
    let {row, col} = this.props;
    return h("td", {className: col.className + " quick-select"},
      row.referenceTypes() ? row.referenceTypes().map(data =>
        h("span", {key: data}, h("a", {href: row.showReferenceUrl(data)}, data), " ")
      ) : null,
      !row.referenceTypes() ? h(TypedValue, {value: row.sortKey(col.name)}) : null
    );
  }
}

class ChildObjectCell extends React.Component {
  render() {
    let {row, col} = this.props;
    return h("td", {className: col.className + " quick-select", key: col.name},
      h("a", {href: row.showChildObjectUrl()}, row.childObject())
    );
  }
}

let TypedValue = props =>
  h("div", {
    className:
      "value-text "
      + (typeof props.value == "string" ? "value-is-string " : "")
      + (typeof props.value == "number" ? "value-is-number " : "")
      + (typeof props.value == "boolean" ? "value-is-boolean " : "")
      + (typeof props.value == "object" ? "value-is-object " : "")
      + (props.value === undefined ? "value-is-unknown " : "")
      + (props.value === null ? "value-is-blank " : "")
      + (props.value === true ? "value-is-boolean-true " : "")
      + (props.value === undefined || props.value === null ? "" : "quick-select ")
  },
    props.value === undefined ? "(Unknown)"
      : props.value === null ? "(Blank)"
      : "" + props.value
  );

class FieldActionsCell extends React.Component {
  constructor(props) {
    super(props);
    this.onOpenDetails = this.onOpenDetails.bind(this);
  }
  onOpenDetails(e) {
    e.preventDefault();
    let {row} = this.props;
    row.rowList.model.showDetailsBox(row.fieldName, row.rowProperties(), row.rowList);
    row.rowList.model.didUpdate();
  }
  render() {
    let {row} = this.props;
    return h("td", {className: "field-actions"},
      h("a", {href: "about:blank", onClick: this.onOpenDetails}, "More"),
      " ",
      h("a", {href: row.openSetup()}, "Setup")
    );
  }
}

class ChildActionsCell extends React.Component {
  constructor(props) {
    super(props);
    this.onOpenDetails = this.onOpenDetails.bind(this);
  }
  onOpenDetails(e) {
    e.preventDefault();
    let {row} = this.props;
    row.rowList.model.showDetailsBox(row.childName, row.rowProperties(), row.rowList);
    row.rowList.model.didUpdate();
  }
  render() {
    let {row} = this.props;
    return h("td", {className: "child-actions"},
      h("a", {href: "about:blank", onClick: this.onOpenDetails}, "More"),
      " ",
      row.queryListUrl() ? h("a", {href: row.queryListUrl(), title: "Export records in this related list"}, "List") : null,
      " ",
      h("a", {href: row.openSetup()}, "Setup")
    );
  }
}

class DetailsBox extends React.Component {
  constructor(props) {
    super(props);
    this.onCloseDetailsBox = this.onCloseDetailsBox.bind(this);
    this.onDetailsFilterInput = this.onDetailsFilterInput.bind(this);
    this.onDetailsFilterClick = this.onDetailsFilterClick.bind(this);
  }
  componentDidMount() {
    this.refs.detailsFilter.focus();
  }
  onCloseDetailsBox(e) {
    e.preventDefault();
    let {model} = this.props;
    model.detailsBox = null;
    model.didUpdate();
  }
  onDetailsFilterInput(e) {
    let {model} = this.props;
    model.detailsFilter = e.target.value;
    model.didUpdate();
  }
  onDetailsFilterClick(e, row, detailsFilterList) {
    e.preventDefault();
    let {model} = this.props;
    model.detailsBox = null;
    detailsFilterList.showColumn(row.key, row.value);
    model.didUpdate();
  }
  render() {
    let {model} = this.props;
    return h("div", {},
      h("div", {id: "fieldDetailsView"},
        h("div", {className: "container"},
          h("a", {href: "about:blank", className: "closeLnk", onClick: this.onCloseDetailsBox}, "X"),
          h("div", {className: "mainContent"},
            h("h3", {}, "All available metadata for \"" + model.detailsBox.name + "\""),
            h("input", {placeholder: "Filter", value: model.detailsFilter, onChange: this.onDetailsFilterInput, ref: "detailsFilter"}),
            h("table", {},
              h("thead", {}, h("tr", {}, h("th", {}, "Key"), h("th", {}, "Value"))),
              h("tbody", {}, model.detailsBox.rows.map(row =>
                h("tr", {hidden: !row.visible(), key: row.key},
                  h("td", {},
                    h("a", {href: "about:blank", onClick: e => this.onDetailsFilterClick(e, row, model.detailsBox.detailsFilterList), hidden: !model.detailsBox.detailsFilterList, title: "Show fields with this property"}, "🔍"),
                    " ",
                    h("span", {className: "quick-select"}, row.key)
                  ),
                  h("td", {}, h(TypedValue, {value: row.value}))
                )
              ))
            )
          )
        )
      )
    );
  }
}

{

  let args = new URLSearchParams(location.search.slice(1));
  let sfHost = args.get("host");
  initButton(sfHost, true);
  sfConn.getSession(sfHost).then(() => {

    let root = document.getElementById("root");
    let model = new Model(sfHost);
    model.sobjectName = args.get("objectType");
    model.useToolingApi = args.has("useToolingApi");
    model.recordId = args.get("recordId");
    model.startLoading();
    model.reactCallback = cb => {
      ReactDOM.render(h(App, {model}), root, cb);
    };
    ReactDOM.render(h(App, {model}), root);

  });

}

{
  let isDragging = false;
  document.body.onmousedown = () => {
    isDragging = false;
  };
  document.body.onmousemove = e => {
    if (e.movementX || e.movementY) {
      isDragging = true;
    }
  };
  document.body.onclick = e => {
    if (!e.target.closest("a") && !isDragging) {
      let el = e.target.closest(".quick-select");
      if (el) {
        getSelection().selectAllChildren(el);
      }
    }
  };
}