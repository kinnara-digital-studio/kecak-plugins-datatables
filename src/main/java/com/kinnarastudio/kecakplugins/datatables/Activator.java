package com.kinnarastudio.kecakplugins.datatables;

import java.util.ArrayList;
import java.util.Collection;

import com.kinnarastudio.kecakplugins.datatables.form.binder.DataTablesGridBinder;
import com.kinnarastudio.kecakplugins.datatables.form.element.DataTablesGridElement;
import com.kinnarastudio.kecakplugins.datatables.userview.DataTablesMenu;
import org.osgi.framework.BundleActivator;
import org.osgi.framework.BundleContext;
import org.osgi.framework.ServiceRegistration;

public class Activator implements BundleActivator {

    protected Collection<ServiceRegistration> registrationList;

    public void start(BundleContext context) {
        registrationList = new ArrayList<ServiceRegistration>();

        //Register plugin here
        registrationList.add(context.registerService(DataTablesMenu.class.getName(), new DataTablesMenu(), null));
        registrationList.add(context.registerService(DataTablesGridElement.class.getName(), new DataTablesGridElement(), null));
        registrationList.add(context.registerService(DataTablesGridBinder.class.getName(), new DataTablesGridBinder(), null));
    }

    public void stop(BundleContext context) {
        for (ServiceRegistration registration : registrationList) {
            registration.unregister();
        }
    }
}