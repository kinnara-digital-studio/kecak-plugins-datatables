package com.kinnarastudio.kecakplugins.datatables;

import java.util.ArrayList;
import java.util.Collection;

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
    }

    public void stop(BundleContext context) {
        for (ServiceRegistration registration : registrationList) {
            registration.unregister();
        }
    }
}