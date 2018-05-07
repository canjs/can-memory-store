var canReflect = require("can-reflect");


function getItems(data){
	if(Array.isArray(data)) {
		return data;
	} else {
		return data.data;
	}
}
// update could remove all other records that would be in the set
function makeSimpleStore(baseConnection) {
    baseConnection.constructor = makeSimpleStore;
    var behavior = Object.create(baseConnection);

    // this stores data like:
    // queries: {[queryKey]: {queryKey, query, recordIds}}
    // records
    return canReflect.assignMap(behavior, {
        getInstanceFromProps: function(record) {
        	var id = canReflect.getIdentity(record, this.queryLogic.schema);
        	return this.getInstance(id);
        },

        log: function(){
			this._log = true;
		},

        getSets: function(){
			return this.getQueries();
		},
		getQueries: function(){
			return Promise.resolve(this.getQueriesSync());
		},

        getListData: function(query){
        	query = query || {};
        	var listData = this.getListDataSync(query);
        	if(listData) {
        		return Promise.resolve(listData);
        	}
        	return Promise.reject({
        		title: "no data",
        		status: "404",
        		detail: "No data available for this query.\nAvailable queries: "+
        			JSON.stringify(this.getQueriesSync())
        	});
        },

        getListDataSync: function(query){
            // first check data
            var records = this.getAllRecords();
            var matching = this.queryLogic.filterMembersAndGetCount(query, {}, records);
            if(matching && matching.count) {
                return matching;
            }
            // now check if we have a query  for it
        	var queries = this.getQueriesSync();
        	for(var i = 0; i < queries.length; i++) {
        		var checkSet = queries[i];
        		if( this.queryLogic.isSubset(query, checkSet) ) {

        			return {count: 0, data: []}
        		}
        	}
        },

        updateListData: function(data, query){
        	query = query || {};
            var clonedData = canReflect.serialize(data);
        	var records = getItems(clonedData);

            // we need to remove everything that would have matched this query before, but that's not in data
            // but what if it's in another set -> we remove it
            var allRecords = this.getAllRecords();
            var curretMatching = this.queryLogic.filterMembers(query, allRecords);
            if(curretMatching.length) {
                var toBeDeleted = new Map();
                curretMatching.forEach(function(record){
                    toBeDeleted.set( canReflect.getIdentity(record, this.queryLogic.schema), record );
                }, this);

                // remove what's in records
                records.forEach(function(record){
                    toBeDeleted.delete( canReflect.getIdentity(record, this.queryLogic.schema) );
                }, this);

                this.destroyRecords( canReflect.toArray(toBeDeleted.values() ) );
            }
            // Update or create all records
            this.updateRecordsSync(records);
            //records.forEach(this.updateRecord.bind(this));

            // Update the list of sets that are being saved

            // the queries that are not consumed by query
            var allQueries = this.getQueriesSync();
            var notSubsets = allQueries.filter(function(existingQuery){
                    return !this.queryLogic.isSubset(existingQuery, query);
                }, this),
                superSets = notSubsets.filter(function(existingQuery){
                    return this.queryLogic.isSubset(query, existingQuery);
                }, this);

            // if there are sets that are parents of query
            if(superSets.length) {
                this.updateQueriesSync(notSubsets);
            } else {
                this.updateQueriesSync(notSubsets.concat([query]));
            }

        	// setData.push({query: query, items: data});
        	return Promise.resolve();
        },

        getData: function(params){
        	var id = canReflect.getIdentity(params, canReflect.getSchema( this.queryLogic ) );
        	var res = this.getRecord(id);
        	if(res){
        		return Promise.resolve( res );
        	} else {
        		return Promise.reject({
        			title: "no data",
        			status: "404",
        			detail: "No record with matching identity ("+id+")."
        		});
        	}
        },
        createData: function(record){
			var instance = this.updateRecordsSync([record]);

			return Promise.resolve(canReflect.assignMap({},instance));
		},

		updateData: function(record){

			if(this.errorOnMissingRecord && !this.getInstanceFromProps(record)) {
				var id = canReflect.getIdentity(record, this.queryLogic.schema);
				return Promise.reject({
					title: "no data",
					status: "404",
					detail: "No record with matching identity ("+id+")."
				});
			}

			var instance = this.updateRecordsSync([record]);

			return Promise.resolve(canReflect.assignMap({},instance));
		},

		destroyData: function(record){
			var id = canReflect.getIdentity(record,  this.queryLogic.schema);
			if(this.errorOnMissingRecord && !this.getInstanceFromProps(record)) {

				return Promise.reject({
					title: "no data",
					status: "404",
					detail: "No record with matching identity ("+id+")."
				});
			}
            this.destroyRecords([record]);
			return Promise.resolve(canReflect.assignMap({},record));
		}
    });
}

module.exports = makeSimpleStore;
