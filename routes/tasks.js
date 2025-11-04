var Task = require('../models/task');
var User = require('../models/user');

module.exports = function(router) {
    var tasksRoute = router.route('/tasks');

    tasksRoute.get(function(req, res) {
        var q = Task.find({});
        if (req.query.where) {
            q = q.where(JSON.parse(req.query.where));
        }
        if (req.query.sort) {
            q = q.sort(JSON.parse(req.query.sort));
        }
        if (req.query.select) {
            q = q.select(JSON.parse(req.query.select));
        }
        if (req.query.skip) {
            q = q.skip(parseInt(req.query.skip));
        }
        if (req.query.limit) {
            q = q.limit(parseInt(req.query.limit));
        } else {
            q = q.limit(100);
        }
        if (req.query.count) {
            q.countDocuments(function(err, cnt) {
                if (err) {
                    return res.status(500).json({message: 'Error counting tasks', data: {}});
                }
                return res.status(200).json({message: 'OK', data: cnt});
            });
        } else {
            q.exec(function(err, tasks) {
                if (err) {
                    return res.status(500).json({message: 'Error getting tasks', data: {}});
                }
                return res.status(200).json({message: 'OK', data: tasks});
            });
        }
    });

    tasksRoute.post(function(req, res) {
        if (!req.body.name || !req.body.deadline) {
            return res.status(400).json({message: 'Name and deadline required', data: {}});
        }
        var t = new Task();
        t.name = req.body.name;
        t.description = req.body.description || "";
        t.deadline = req.body.deadline;
        t.completed = req.body.completed || false;
        t.assignedUser = req.body.assignedUser || "";
        t.assignedUserName = req.body.assignedUserName || "unassigned";
        t.save(function(err) {
            if (err) {
                return res.status(500).json({message: 'Error creating task', data: {}});
            }
            return res.status(201).json({message: 'Task created', data: t});
        });
    });

    var taskRoute = router.route('/tasks/:id');

    taskRoute.get(function(req, res) {
        var q = Task.findById(req.params.id);
        if (req.query.select) {
            q = q.select(JSON.parse(req.query.select));
        }
        q.exec(function(err, t) {
            if (err || !t) {
                return res.status(404).json({message: 'Task not found', data: {}});
            }
            return res.status(200).json({message: 'OK', data: t});
        });
    });

    taskRoute.put(function(req, res) {
        if (!req.body.name || !req.body.deadline) {
            return res.status(400).json({message: 'Name and deadline required', data: {}});
        }
        Task.findById(req.params.id, function(err, t) {
            if (err || !t) {
                return res.status(404).json({message: 'Task not found', data: {}});
            }
            var oldUid = t.assignedUser;
            var newUid = req.body.assignedUser || "";
            t.name = req.body.name;
            t.description = req.body.description || "";
            t.deadline = req.body.deadline;
            t.completed = req.body.completed || false;
            t.assignedUser = newUid;
            t.assignedUserName = req.body.assignedUserName || "unassigned";
            t.save(function(err) {
                if (err) {
                    return res.status(500).json({message: 'Error updating task', data: {}});
                }
                
                var pendingOps = 0;
                var opsCompleted = 0;
                
                function checkComplete() {
                    opsCompleted++;
                    if (opsCompleted === pendingOps) {
                        return res.status(200).json({message: 'Task updated', data: t});
                    }
                }
                
                if (oldUid && oldUid !== newUid) {
                    pendingOps++;
                    User.findById(oldUid, function(e, u) {
                        if (!e && u) {
                            u.pendingTasks = u.pendingTasks.filter(function(tid) {
                                return tid !== req.params.id;
                            });
                            u.save(function() {
                                checkComplete();
                            });
                        } else {
                            checkComplete();
                        }
                    });
                }
                if (newUid && newUid !== oldUid) {
                    pendingOps++;
                    User.findById(newUid, function(e, u) {
                        if (!e && u) {
                            if (!u.pendingTasks.includes(req.params.id)) {
                                u.pendingTasks.push(req.params.id);
                                u.save(function() {
                                    checkComplete();
                                });
                            } else {
                                checkComplete();
                            }
                        } else {
                            checkComplete();
                        }
                    });
                }
                
                if (pendingOps === 0) {
                    return res.status(200).json({message: 'Task updated', data: t});
                }
            });
        });
    });

    taskRoute.delete(function(req, res) {
        Task.findByIdAndRemove(req.params.id, function(err, t) {
            if (err || !t) {
                return res.status(404).json({message: 'Task not found', data: {}});
            }
            if (t.assignedUser) {
                User.findById(t.assignedUser, function(e, u) {
                    if (!e && u) {
                        u.pendingTasks = u.pendingTasks.filter(function(tid) {
                            return tid !== req.params.id;
                        });
                        u.save(function() {
                            return res.status(200).json({message: 'Task deleted', data: t});
                        });
                    } else {
                        return res.status(200).json({message: 'Task deleted', data: t});
                    }
                });
            } else {
                return res.status(200).json({message: 'Task deleted', data: t});
            }
        });
    });

    return router;
};

