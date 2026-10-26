angular.module('beamng.apps')
.directive('driftSketchPanel', ['$window', function($window) {
  return {
    replace: true,
    restrict: 'EA',
    templateUrl: '/ui/modules/apps/DriftSketch/app.html',
    link: function(scope) {
      scope.modVersion = '0.1.0';
      scope.state = {recording:false, pointCount:0, pathLength:0, buildCount:0, coneCount:0,
        vehicleName:'No vehicle', status:'Loading DriftSketch…', statusError:false};
      scope.settings = {mesh:'cone', spacing:2.4, width:5.0, sides:'both', scale:1.0,
        groundOffset:-0.55, maxCones:1200, smooth:true, keepBuilds:true};

      function lua(command) {
        if ($window.bngApi && $window.bngApi.engineLua) $window.bngApi.engineLua(command);
      }
      scope.start = function() { lua('extensions.driftSketch.start()'); };
      scope.stop = function() { lua('extensions.driftSketch.stop()'); };
      scope.rebuild = function() { lua('extensions.driftSketch.rebuild()'); };
      scope.clear = function() { lua('extensions.driftSketch.clear()'); };
      scope.pushSetting = function(key) {
        var value = scope.settings[key];
        if (['spacing','width','scale','groundOffset','maxCones'].indexOf(key) >= 0) value = Number(value);
        lua('extensions.driftSketch.setSetting(' + JSON.stringify(key) + ',' + JSON.stringify(value) + ')');
      };
      scope.meters = function(value) { return (Number(value) || 0).toFixed(1) + ' m'; };
      scope.integer = function(value) { return Math.round(Number(value) || 0); };

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
