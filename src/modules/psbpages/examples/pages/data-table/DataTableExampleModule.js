"use client";

import { Card, TableZ } from "@/shared/components/ui";
import { useDataTableModuleController } from "./useDataTableModuleController";

export default function DataTableExampleModule({ userScope }) {
  const {
    rows,
    loading,
    errorText,
    columns,
    filterConfig,
    actions,
    pageSizeOptions,
    tableState,
    handleTableChange,
  } = useDataTableModuleController({ userScope });

  return (
    <div className="d-flex flex-column gap-3">
      <Card
        title="Data Table Companion Example"
        subtitle="Enterprise data table mode: module-controlled state + server-backed filtering, sorting, pagination, and export"
      >
        <p className="text-muted mb-3">
          This page is the copy-ready reference implementation for the data table contract and ActionColumn rules.
        </p>

        {errorText ? <p className="text-danger mb-3">{errorText}</p> : null}

        <TableZ
          data={rows}
          columns={columns}
          state={tableState}
          filterConfig={filterConfig}
          actions={actions}
          loading={loading}
          pageSizeOptions={pageSizeOptions}
          searchPlaceholder="Search by employee code, name, email, team, role, or status"
          emptyMessage="No employees match the current server query."
          loadingMessage="Loading employees from server..."
          onChange={handleTableChange}
        />
      </Card>
    </div>
  );
}
