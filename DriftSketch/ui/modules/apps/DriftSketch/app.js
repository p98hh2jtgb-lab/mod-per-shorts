angular.module('beamng.apps')
.directive('driftSketchPanel', ['$window', function($window) {
  return {
    replace: true,
    restrict: 'EA',
    templateUrl: '/ui/modules/apps/DriftSketch/app.html',
    link: function(scope) {
      scope.modVersion = '0.9.0';
      scope.state = {recording:false, pointCount:0, pathLength:0, buildCount:0, coneCount:0,
        ringsBuilt:0, ringSetCount:0, meshCount:0,
        vehicleName:'No vehicle', status:'Loading DriftSketch…', statusError:false};
      scope.settings = {mesh:'cone', tireColors:'rw', spacing:1.0, width:4.2, scale:1.0,
        groundOffset:-0.55, maxCones:2000, smooth:true, keepBuilds:true, collision:false, driftWidth:true, gates:true,
        rings:false, ringCount:5, ringSize:7.0, ringGap:15.0, ringLift:0.0};

      var NUMERIC = ['spacing','width','scale','groundOffset','maxCones','ringCount','ringSize','ringGap','ringLift'];
      function lua(command) {
        if ($window.bngApi && $window.bngApi.engineLua) $window.bngApi.engineLua(command);
      }
      scope.start = function() { lua('extensions.driftSketch.start()'); };
      scope.stop = function() { lua('extensions.driftSketch.stop()'); };
      scope.rebuild = function() { lua('extensions.driftSketch.rebuild()'); };
      scope.clear = function() { lua('extensions.driftSketch.clear()'); };
      scope.placeRings = function() { lua('extensions.driftSketch.placeRings()'); };
      scope.clearRings = function() { lua('extensions.driftSketch.clearRings()'); };
      scope.pushSetting = function(key) {
        var value = scope.settings[key];
        if (NUMERIC.indexOf(key) >= 0) value = Number(value);
        lua('extensions.driftSketch.setSetting(' + JSON.stringify(key) + ',' + JSON.stringify(value) + ')');
      };
      scope.selectMesh = function(mesh) {
        if (['cone','tireStack'].indexOf(mesh) < 0) return;
        // Native select popups are unreliable in the BeamNG app viewport.
        // These always-visible buttons update the real GE setting in one click;
        // saved drives rebuild immediately.
        scope.settings.mesh = mesh;
        scope.pushSetting('mesh');
      };
      scope.selectTireColors = function(colors) {
        if (['rw','rwb'].indexOf(colors) < 0) return;
        scope.settings.tireColors = colors;
        scope.pushSetting('tireColors');
      };
      scope.meters = function(value) { return (Number(value) || 0).toFixed(1) + ' m'; };
      scope.integer = function(value) { return Math.round(Number(value) || 0); };
      scope.meshTotal = function() {
        var s = scope.state || {};
        if (s.meshCount !== undefined) return Math.round(Number(s.meshCount) || 0);
        return Math.round((Number(s.coneCount) || 0) + (Number(s.ringsBuilt) || 0));
      };
      scope.canRebuild = function() {
        var s = scope.state || {};
        return !s.recording && ((s.buildCount || 0) > 0 || (s.ringSetCount || 0) > 0);
      };
      scope.hasRings = function() {
        var s = scope.state || {};
        return (s.ringsBuilt || 0) > 0 || (s.ringSetCount || 0) > 0 || !!(scope.settings && scope.settings.rings);
      };

      var offState = scope.$on('driftSketch.state', function(_event, data) {
        if (!data) return;
        scope.$applyAsync(function() {
          scope.state = data;
          if (data.settings) scope.settings = data.settings;
        });
      });
      scope.$on('$destroy', function() { if (offState) offState(); });
      lua('extensions.driftSketch.uiState()');
    }
  };
}]);
