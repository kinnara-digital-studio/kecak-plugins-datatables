package com.kinnarastudio.kecakplugins.datatables.userview.biz;

import com.kinnarastudio.kecakplugins.datatables.util.Validator;
import org.joget.apps.app.dao.DatalistDefinitionDao;
import org.joget.apps.app.model.AppDefinition;
import org.joget.apps.app.model.DatalistDefinition;
import org.joget.apps.app.service.AppService;
import org.joget.apps.app.service.AppUtil;
import org.joget.apps.datalist.model.DataList;
import org.joget.apps.datalist.model.DataListCollection;
import org.joget.apps.datalist.model.DataListColumn;
import org.joget.apps.datalist.model.DataListFilterQueryObject;
import org.joget.apps.datalist.service.DataListService;
import org.joget.commons.util.LogUtil;
import org.joget.workflow.model.WorkflowAssignment;
import org.joget.workflow.model.WorkflowProcess;
import org.joget.workflow.model.dao.WorkflowProcessLinkDao;
import org.joget.workflow.model.service.WorkflowManager;
import org.springframework.context.ApplicationContext;

import java.util.*;
import java.util.stream.Collectors;

public class DataTablesInboxBiz {
    private volatile Map<String, List<WorkflowAssignment>> cachedAssignments;
    private volatile Map<String, Collection<String>> cachedRecordIdToProcessId;

    protected ApplicationContext getContext() {
        return AppUtil.getApplicationContext();
    }

    protected String getClassName() {
        return getClass().getName();
    }

    public DataList getDataListColumns(String dataListId, AppDefinition appDef) {
        if (Validator.isNullOrEmpty(dataListId) || Validator.isNullOrEmpty(appDef)) {
            LogUtil.warn(getClassName(), "Empty datalistId / Application Definition");
            return new DataList();
        }

        ApplicationContext ac = getContext();
        DataListService dataListService = (DataListService) ac.getBean("dataListService");
        DatalistDefinitionDao dao = (DatalistDefinitionDao) ac.getBean("datalistDefinitionDao");

        DatalistDefinition def = dao.loadById(dataListId, appDef);
        if (Validator.isNullOrEmpty(def)) {
            LogUtil.warn(getClassName(), "Empty DatalistDefinition");
            return new DataList();
        }

        DataList dataList = dataListService.fromJson(def.getJson());

        extendColumns(dataList);

        return dataList;
    }

    public DataListCollection<Map<String, Object>> getDataListRows(
            String dataListId, String assignmentFilter, String processId, String activityDefIds, AppDefinition appDef) {

        if (Validator.isNullOrEmpty(dataListId) || Validator.isNullOrEmpty(appDef)) {
            LogUtil.warn(getClassName(), "Empty datalistId / Application Definition");
            return new DataListCollection<>();
        }

        DataList dataList = getDataListColumns(dataListId, appDef);

        applyFilter(dataList, dataListId, assignmentFilter, processId, activityDefIds, appDef);

        DataListCollection<Map<String, Object>> rows = dataList.getRows();

        getRows(dataList, dataListId, assignmentFilter, processId, activityDefIds, appDef);

        return rows;
    }

    protected void extendColumns(DataList dataList) {
        if (Arrays.stream(dataList.getColumns())
                .anyMatch(c -> "activityName".equals(c.getName()))) {
            return;
        }

        List<DataListColumn> columns = new ArrayList<>(Arrays.asList(dataList.getColumns()));

        DataListColumn col = new DataListColumn();
        col.setName("activityName");
        col.setLabel("Activity Name");
        col.setSortable(false);

        columns.add(col);
        dataList.setColumns(columns.toArray(new DataListColumn[0]));
    }

    protected void applyFilter(
            DataList dataList,
            String dataListId,
            String assignmentFilter,
            String processId,
            String activityDefIds,
            AppDefinition appDef) {

        Set<String> recordIds = getCachedRecordIdToProcessId(dataListId, assignmentFilter, processId, activityDefIds, appDef).keySet();

        DataListFilterQueryObject filter = new DataListFilterQueryObject();
        filter.setOperator("AND");

        if (recordIds.isEmpty()) {
            filter.setQuery("1 = 0");
            dataList.addFilterQueryObject(filter);
            return;
        }

        String pk = dataList.getBinder().getPrimaryKeyColumnName();
        String placeholders = recordIds.stream().map(v -> "?").collect(Collectors.joining(","));

        filter.setQuery(pk + " IN (" + placeholders + ")");
        filter.setValues(recordIds.toArray(new String[0]));

        dataList.addFilterQueryObject(filter);
    }

    protected void getRows(DataList dataList, String dataListId, String assignmentFilter, String processId, String activityDefIds, AppDefinition appDef) {
        DataListCollection<Map<String, Object>> rows = dataList.getRows();
        if (Validator.isNullOrEmpty(rows)) return;

        String pk = dataList.getBinder().getPrimaryKeyColumnName();

        Map<String, Collection<String>> recordToProcess =
                getCachedRecordIdToProcessId(
                        dataListId, assignmentFilter, processId, activityDefIds, appDef
                );

        Map<String, List<WorkflowAssignment>> assignmentMap =
                getCachedAssignments(
                        dataListId, assignmentFilter, processId, activityDefIds, appDef
                );

        for (Map<String, Object> row : rows) {
            Object recordId = row.get(pk);
            if (Validator.isNullOrEmpty(recordId)) {
                continue;
            }

            if (Validator.isNullOrEmpty(recordId)) continue;

            Collection<String> processIds = recordToProcess.get(recordId.toString());

            if (Validator.isNullOrEmpty(processIds)) continue;

            for (String pid : processIds) {
                List<WorkflowAssignment> assList = assignmentMap.get(pid);
                if (Validator.isNullOrEmpty(assList)) continue;

                for (WorkflowAssignment ass : assList) {
                    row.put("activityName", ass.getActivityName());
                    row.put("activityId", ass.getActivityId());
                }
            }
        }
    }

    protected Map<String, List<WorkflowAssignment>> getCachedAssignments(String dataListId, String assignmentFilter, String processId, String activityDefIds, AppDefinition appDef) {
        if (cachedAssignments != null) return cachedAssignments;

        synchronized (this) {
            if (cachedAssignments != null) return cachedAssignments;

            Collection<WorkflowAssignment> assignments =
                    getAssignmentList(
                            dataListId, assignmentFilter, processId, activityDefIds,
                            appDef, null, null, null, null
                    );

            cachedAssignments = assignments.stream()
                    .filter(Objects::nonNull)
                    .collect(Collectors.groupingBy(WorkflowAssignment::getProcessId));

            return cachedAssignments;
        }
    }

    protected Map<String, Collection<String>> getCachedRecordIdToProcessId(
            String dataListId,
            String assignmentFilter,
            String processId,
            String activityDefIds,
            AppDefinition appDef) {

        if (cachedRecordIdToProcessId != null) return cachedRecordIdToProcessId;

        synchronized (this) {
            if (cachedRecordIdToProcessId != null) return cachedRecordIdToProcessId;

            Set<String> processIds =
                    getCachedAssignments(
                            dataListId, assignmentFilter, processId, activityDefIds, appDef
                    ).keySet();

            if (processIds.isEmpty()) {
                cachedRecordIdToProcessId = Collections.emptyMap();
                return cachedRecordIdToProcessId;
            }

            WorkflowProcessLinkDao dao = (WorkflowProcessLinkDao) getContext().getBean("workflowProcessLinkDao");

            cachedRecordIdToProcessId = dao.getOriginalIds(processIds);
            return cachedRecordIdToProcessId;
        }
    }

    protected Collection<WorkflowAssignment> getAssignmentList(
            String dataListId,
            String assignmentFilter,
            String processId,
            String activityDefIds,
            AppDefinition appDef,
            String sort,
            Boolean desc,
            Integer start,
            Integer size) {

        if (appDef == null) return Collections.emptyList();

        WorkflowManager wm = (WorkflowManager) getContext().getBean("workflowManager");
        AppService appService = (AppService) getContext().getBean("appService");

        boolean lite = Validator.isNotNullOrEmpty(dataListId);

        if ("all".equals(assignmentFilter)) {
            return lite
                    ? wm.getAssignmentListLite(
                    appDef.getPackageDefinition().getId(),
                    null, null, null, sort, desc, start, size)
                    : wm.getAssignmentList(
                    appDef.getPackageDefinition().getId(),
                    null, null, null, sort, desc, start, size);
        }

        if ("process".equals(assignmentFilter)) {
            return getByProcess(processId, appDef, wm, appService, lite, sort, desc, start, size);
        }

        if ("activity".equals(assignmentFilter)) {
            return getByActivity(processId, activityDefIds, appDef, wm, appService, lite, sort, desc, start, size);
        }

        return Collections.emptyList();
    }

    protected Collection<WorkflowAssignment> getByProcess(
            String processId,
            AppDefinition appDef,
            WorkflowManager wm,
            AppService appService,
            boolean lite,
            String sort,
            Boolean desc,
            Integer start,
            Integer size) {

        if (Validator.isNullOrEmpty(processId)){
            LogUtil.warn(getClassName(), "Empty processId");
            return Collections.emptyList();
        }

        WorkflowProcess process =
                appService.getWorkflowProcessForApp(
                        appDef.getId(),
                        appDef.getVersion().toString(),
                        processId
                );

        if (Validator.isNullOrEmpty(process)){
            LogUtil.warn(getClassName(), "Empty process");
            return Collections.emptyList();
        }

        return lite
                ? wm.getAssignmentListLite(
                null, process.getId(), null, null, sort, desc, start, size)
                : wm.getAssignmentList(
                null, process.getId(), null, null, sort, desc, start, size);
    }

    protected Collection<WorkflowAssignment> getByActivity(
            String processId,
            String activityDefIds,
            AppDefinition appDef,
            WorkflowManager wm,
            AppService appService,
            boolean lite,
            String sort,
            Boolean desc,
            Integer start,
            Integer size) {

        if (Validator.isNullOrEmpty(processId) || Validator.isNullOrEmpty(activityDefIds)) {
            LogUtil.warn(getClassName(), "Empty processId / activityDefId");
            return Collections.emptyList();
        }

        WorkflowProcess process =
                appService.getWorkflowProcessForApp(
                        appDef.getId(),
                        appDef.getVersion().toString(),
                        processId
                );

        if (Validator.isNullOrEmpty(process)){
            LogUtil.warn(getClassName(), "Empty process");
            return Collections.emptyList();
        }

        return Arrays.stream(activityDefIds.split(";"))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .flatMap(act ->
                        (lite
                                ? wm.getAssignmentListLite(
                                null, process.getId(), null, act, sort, desc, start, size)
                                : wm.getAssignmentList(
                                null, process.getId(), null, act, sort, desc, start, size)
                        ).stream()
                )
                .collect(Collectors.toList());
    }
}
