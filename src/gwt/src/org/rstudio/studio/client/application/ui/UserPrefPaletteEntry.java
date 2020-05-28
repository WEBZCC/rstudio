/*
 * UserPrefPaletteEntry.java
 *
 * Copyright (C) 2020 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
package org.rstudio.studio.client.application.ui;

import org.rstudio.studio.client.workbench.prefs.model.Prefs.PrefValue;

public abstract class UserPrefPaletteEntry extends CommandPaletteEntry
{
   public UserPrefPaletteEntry(PrefValue<?> val)
   {
      super();
      pref_ = val;
   }

   @Override
   public String getLabel()
   {
      return pref_.getTitle();
   }

   @Override
   public String getId()
   {
      return pref_.getId();
   }

   @Override
   public String getContext()
   {
      return new String("Setting");
   }
   
   @Override
   public String getScope()
   {
      return "userpref";
   }

   @Override
   public boolean enabled()
   {
      // User preferences are always enabled
      return true;
   }
   
   @Override
   public boolean dismissOnInvoke()
   {
      return false;
   }

   protected final PrefValue<?> pref_;
}
